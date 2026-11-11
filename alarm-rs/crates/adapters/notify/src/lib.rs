//! Notifier adapter (ALARM_SPEC 3.14, TZ_RUST 3.8, 3.11, 6 row 3.14) and driving adapter for the
//! notification's `Snooze N min` button and clicks.
//!
//! - macOS: `UNUserNotificationCenter` (needs the app bundle; outside a bundle notifications are
//!   only logged). Whether an alert stays on screen follows the user's "Alerts" style.
//! - Linux: `notify-rust`, `Urgency::Critical` + `Timeout::Never`, an action button.
//! - Windows: WinRT toast with `scenario="alarm"` and a button.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::sync::Arc;

use app::ports::{Notification, Notifier};
use domain::model::NotifyStatus;

/// What the user did with a notification.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NotifyAction {
    /// The `Snooze N min` button on an alarm notification.
    Snooze(String),
    /// A click on the notification body.
    Open,
    /// The permission state may have changed.
    StatusChanged,
}

pub type ActionHandler = Arc<dyn Fn(NotifyAction) + Send + Sync>;

/// Alarm id from a notification tag `alarm-<id>`.
pub fn alarm_id_from_tag(tag: &str) -> Option<String> {
    tag.strip_prefix("alarm-").map(str::to_string)
}

/// A notifier that only logs (tests, headless e2e, development outside the bundle).
pub struct LogNotifier;

impl Notifier for LogNotifier {
    fn status(&self) -> NotifyStatus {
        NotifyStatus::On
    }
    fn request_permission(&self) {}
    fn show(&self, n: &Notification) {
        log::info!("notification [{}] {} — {}", n.tag, n.title, n.body.replace('\n', " / "));
    }
    fn close(&self, tag: &str) {
        log::info!("notification [{tag}] closed");
    }
}

/// The system notifier for this OS, or `LogNotifier` when it is unavailable.
pub fn system(on_action: ActionHandler) -> Box<dyn Notifier> {
    #[cfg(target_os = "macos")]
    {
        match mac::MacNotifier::new(on_action) {
            Some(n) => Box::new(n),
            None => {
                log::warn!("not running from an app bundle: notifications are only logged");
                Box::new(LogNotifier)
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxNotifier::new(on_action))
    }
    #[cfg(windows)]
    {
        Box::new(win::WinNotifier::new(on_action))
    }
}

// ------------------------------------------------------------------ macOS --

#[cfg(target_os = "macos")]
mod mac {
    use std::collections::BTreeSet;
    use std::sync::Mutex;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, ProtocolObject};
    use objc2::{AllocAnyThread, DefinedClass, define_class, msg_send};
    use objc2_foundation::{NSArray, NSBundle, NSError, NSObject, NSObjectProtocol, NSSet, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
        UNNotificationAction, UNNotificationActionOptions, UNNotificationCategory, UNNotificationCategoryOptions,
        UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse, UNNotificationSettings,
        UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };

    use super::*;

    const SNOOZE_ACTION: &str = "snooze";

    pub struct DelegateIvars {
        on_action: ActionHandler,
    }

    define_class!(
        // SAFETY: NSObject has no subclassing requirements; the class does not implement Drop.
        #[unsafe(super(NSObject))]
        #[ivars = DelegateIvars]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn will_present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                // The daemon is always "in the foreground" for the system: show the banner anyway.
                handler.call((UNNotificationPresentationOptions::Banner | UNNotificationPresentationOptions::List,));
            }

            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn did_receive(
                &self,
                _center: &UNUserNotificationCenter,
                response: &UNNotificationResponse,
                handler: &block2::DynBlock<dyn Fn()>,
            ) {
                let action = response.actionIdentifier().to_string();
                let tag = response.notification().request().identifier().to_string();
                let on_action = &self.ivars().on_action;
                if action == SNOOZE_ACTION {
                    if let Some(id) = alarm_id_from_tag(&tag) {
                        on_action(NotifyAction::Snooze(id));
                    }
                } else if !action.ends_with("DismissActionIdentifier") {
                    on_action(NotifyAction::Open);
                }
                handler.call(());
            }
        }
    );

    impl Delegate {
        fn new(on_action: ActionHandler) -> Retained<Self> {
            let this = Self::alloc().set_ivars(DelegateIvars { on_action });
            // SAFETY: NSObject's designated initializer.
            unsafe { msg_send![super(this), init] }
        }
    }

    struct Shared {
        status: Mutex<NotifyStatus>,
        categories: Mutex<BTreeSet<String>>,
        on_action: ActionHandler,
    }

    pub struct MacNotifier {
        center: Retained<UNUserNotificationCenter>,
        shared: Arc<Shared>,
        _delegate: Retained<Delegate>,
    }

    // SAFETY: UNUserNotificationCenter is documented as thread-safe; the delegate is only read.
    unsafe impl Send for MacNotifier {}

    impl MacNotifier {
        pub fn new(on_action: ActionHandler) -> Option<Self> {
            NSBundle::mainBundle().bundleIdentifier()?;
            let center = UNUserNotificationCenter::currentNotificationCenter();
            let delegate = Delegate::new(on_action.clone());
            center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            let shared = Arc::new(Shared {
                status: Mutex::new(NotifyStatus::NotDetermined),
                categories: Mutex::new(BTreeSet::new()),
                on_action,
            });
            let n = MacNotifier {
                center,
                shared,
                _delegate: delegate,
            };
            n.refresh_status();
            Some(n)
        }

        fn refresh_status(&self) {
            let shared = self.shared.clone();
            let block = RcBlock::new(move |settings: std::ptr::NonNull<UNNotificationSettings>| {
                // SAFETY: the system passes a valid settings object for the duration of the call.
                let settings = unsafe { settings.as_ref() };
                let status = match settings.authorizationStatus() {
                    UNAuthorizationStatus::NotDetermined => NotifyStatus::NotDetermined,
                    UNAuthorizationStatus::Denied => NotifyStatus::Blocked,
                    _ => NotifyStatus::On,
                };
                let changed = {
                    let mut cur = shared.status.lock().unwrap_or_else(|p| p.into_inner());
                    let changed = *cur != status;
                    *cur = status;
                    changed
                };
                if changed {
                    (shared.on_action)(NotifyAction::StatusChanged);
                }
            });
            self.center.getNotificationSettingsWithCompletionHandler(&block);
        }

        fn ensure_category(&self, title: &str) -> String {
            let id = format!("snooze:{title}");
            let mut cats = self.shared.categories.lock().unwrap_or_else(|p| p.into_inner());
            if cats.insert(id.clone()) {
                let all: Vec<Retained<UNNotificationCategory>> = cats
                    .iter()
                    .map(|cid| {
                        let label = cid.trim_start_matches("snooze:");
                        let action = UNNotificationAction::actionWithIdentifier_title_options(
                            &NSString::from_str(SNOOZE_ACTION),
                            &NSString::from_str(label),
                            UNNotificationActionOptions(0),
                        );
                        UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
                            &NSString::from_str(cid),
                            &NSArray::from_retained_slice(&[action]),
                            &NSArray::from_retained_slice(&[]),
                            UNNotificationCategoryOptions(0),
                        )
                    })
                    .collect();
                self.center.setNotificationCategories(&NSSet::from_retained_slice(&all));
            }
            id
        }
    }

    impl Notifier for MacNotifier {
        fn status(&self) -> NotifyStatus {
            self.refresh_status();
            *self.shared.status.lock().unwrap_or_else(|p| p.into_inner())
        }

        fn request_permission(&self) {
            let shared = self.shared.clone();
            let block = RcBlock::new(move |granted: Bool, _err: *mut NSError| {
                let status = if granted.as_bool() {
                    NotifyStatus::On
                } else {
                    NotifyStatus::Blocked
                };
                *shared.status.lock().unwrap_or_else(|p| p.into_inner()) = status;
                (shared.on_action)(NotifyAction::StatusChanged);
            });
            self.center.requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
                &block,
            );
        }

        fn show(&self, n: &Notification) {
            let content = UNMutableNotificationContent::new();
            content.setTitle(&NSString::from_str(&n.title));
            content.setBody(&NSString::from_str(&n.body));
            if let Some(title) = &n.snooze_action {
                let cat = self.ensure_category(title);
                content.setCategoryIdentifier(&NSString::from_str(&cat));
            }
            let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
                &NSString::from_str(&n.tag),
                &content,
                None,
            );
            let tag = n.tag.clone();
            let block = RcBlock::new(move |err: *mut NSError| {
                if !err.is_null() {
                    // SAFETY: non-null error object passed by the system.
                    let e = unsafe { &*err };
                    log::warn!("notification {tag} failed: {}", e.localizedDescription());
                }
            });
            self.center
                .addNotificationRequest_withCompletionHandler(&request, Some(&block));
            log::info!("notification [{}] {}", n.tag, n.title);
        }

        fn close(&self, tag: &str) {
            let ids = NSArray::from_retained_slice(&[NSString::from_str(tag)]);
            self.center.removeDeliveredNotificationsWithIdentifiers(&ids);
            self.center.removePendingNotificationRequestsWithIdentifiers(&ids);
        }
    }
}

// ------------------------------------------------------------------ Linux --

#[cfg(target_os = "linux")]
mod linux {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use notify_rust::{Hint, Timeout, Urgency};

    use super::*;

    pub struct LinuxNotifier {
        on_action: ActionHandler,
        open: Arc<Mutex<HashMap<String, u32>>>,
    }

    impl LinuxNotifier {
        pub fn new(on_action: ActionHandler) -> Self {
            LinuxNotifier {
                on_action,
                open: Arc::new(Mutex::new(HashMap::new())),
            }
        }
    }

    impl Notifier for LinuxNotifier {
        fn status(&self) -> NotifyStatus {
            NotifyStatus::On
        }
        fn request_permission(&self) {}
        fn show(&self, n: &Notification) {
            let mut b = notify_rust::Notification::new();
            b.appname("Alarm")
                .summary(&n.title)
                .body(&n.body)
                .action("default", "Open");
            if n.persistent {
                b.urgency(Urgency::Critical)
                    .timeout(Timeout::Never)
                    .hint(Hint::Resident(true));
            }
            if let Some(label) = &n.snooze_action {
                b.action("snooze", label);
            }
            let tag = n.tag.clone();
            let on_action = self.on_action.clone();
            let open = self.open.clone();
            std::thread::spawn(move || match b.show() {
                Ok(handle) => {
                    open.lock()
                        .unwrap_or_else(|p| p.into_inner())
                        .insert(tag.clone(), handle.id());
                    handle.wait_for_action(|action| match action {
                        "snooze" => {
                            if let Some(id) = alarm_id_from_tag(&tag) {
                                on_action(NotifyAction::Snooze(id));
                            }
                        }
                        "default" => on_action(NotifyAction::Open),
                        _ => {}
                    });
                }
                Err(e) => log::warn!("notification failed: {e}"),
            });
        }
        fn close(&self, tag: &str) {
            if let Some(id) = self.open.lock().unwrap_or_else(|p| p.into_inner()).remove(tag) {
                let mut n = notify_rust::Notification::new();
                n.id(id);
                if let Ok(h) = n.show() {
                    h.close();
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Windows --

#[cfg(windows)]
mod win {
    use tauri_winrt_notification::{Duration, Scenario, Toast};

    use super::*;

    pub const APP_ID: &str = "org.alarmrs.Alarm";

    pub struct WinNotifier {
        on_action: ActionHandler,
    }

    impl WinNotifier {
        pub fn new(on_action: ActionHandler) -> Self {
            WinNotifier { on_action }
        }
    }

    impl Notifier for WinNotifier {
        fn status(&self) -> NotifyStatus {
            NotifyStatus::On
        }
        fn request_permission(&self) {}
        fn show(&self, n: &Notification) {
            let mut lines = n.body.splitn(2, '\n');
            let mut toast = Toast::new(APP_ID)
                .title(&n.title)
                .text1(lines.next().unwrap_or_default());
            if let Some(second) = lines.next() {
                toast = toast.text2(second);
            }
            if n.persistent {
                toast = toast.scenario(Scenario::Alarm).duration(Duration::Long);
            }
            if let Some(label) = &n.snooze_action {
                toast = toast.add_button(label, "snooze");
            }
            let tag = n.tag.clone();
            let on_action = self.on_action.clone();
            toast = toast.on_activated(move |arg| {
                match arg.as_deref() {
                    Some("snooze") => {
                        if let Some(id) = alarm_id_from_tag(&tag) {
                            on_action(NotifyAction::Snooze(id));
                        }
                    }
                    _ => on_action(NotifyAction::Open),
                }
                Ok(())
            });
            if let Err(e) = toast.show() {
                log::warn!("toast failed: {e}");
            }
        }
        fn close(&self, _tag: &str) {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags() {
        assert_eq!(alarm_id_from_tag("alarm-abc"), Some("abc".into()));
        assert_eq!(alarm_id_from_tag("timer"), None);
    }
}
