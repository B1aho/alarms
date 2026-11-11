//! Tray / menu bar adapter (TZ_RUST 3.13): tooltip `Alarm`; menu `Open Alarm`, `Snooze N min`
//! (only while a snoozable alarm rings), separator, `Quit`. On macOS a template alarm-clock icon
//! and no Dock icon for the daemon. The `tao` event loop runs on the main thread.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]
#![forbid(unsafe_code)]

use app::ports::TrayMenu;
use domain::strings;
use tao::event::{Event, StartCause};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIconBuilder};

/// What the user picked in the tray menu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayAction {
    Open,
    Snooze,
    Quit,
}

#[derive(Debug)]
pub enum UserEvent {
    SetSnooze(Option<String>),
    Menu(MenuEvent),
    Exit,
}

/// Sends updates to the tray from any thread (the `TrayMenu` port).
#[derive(Clone)]
pub struct TrayHandle {
    proxy: EventLoopProxy<UserEvent>,
}

impl TrayHandle {
    /// End the event loop (the process exits).
    pub fn exit(&self) {
        let _ = self.proxy.send_event(UserEvent::Exit);
    }
}

impl TrayMenu for TrayHandle {
    fn set_snooze(&self, label: Option<String>) {
        let _ = self.proxy.send_event(UserEvent::SetSnooze(label));
    }
}

/// A tray that does nothing (headless e2e, tests).
pub struct NoTray;

impl TrayMenu for NoTray {
    fn set_snooze(&self, _label: Option<String>) {}
}

/// The alarm-clock icon of `Icons.tsx` (24-unit grid, stroke 1.8), rasterised as a black template
/// image with anti-aliased edges.
pub fn icon_rgba(size: u32) -> Vec<u8> {
    let s = size as f32 / 24.0;
    let half = 1.8 * s / 2.0;
    let seg = |px: f32, py: f32, a: (f32, f32), b: (f32, f32)| -> f32 {
        let (ax, ay, bx, by) = (a.0 * s, a.1 * s, b.0 * s, b.1 * s);
        let (dx, dy) = (bx - ax, by - ay);
        let t = (((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)).clamp(0.0, 1.0);
        ((px - ax - t * dx).powi(2) + (py - ay - t * dy).powi(2)).sqrt()
    };
    let segments = [
        ((12.0, 9.0), (12.0, 13.2)),
        ((12.0, 13.2), (14.6, 14.8)),
        ((4.5, 4.8), (7.0, 2.8)),
        ((19.5, 4.8), (17.0, 2.8)),
        ((7.0, 20.2), (5.6, 21.8)),
        ((17.0, 20.2), (18.4, 21.8)),
    ];
    let mut out = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let (px, py) = (x as f32 + 0.5, y as f32 + 0.5);
            let ring = (((px - 12.0 * s).powi(2) + (py - 13.0 * s).powi(2)).sqrt() - 7.5 * s).abs();
            let d = segments.iter().map(|(a, b)| seg(px, py, *a, *b)).fold(ring, f32::min);
            let alpha = (half - d + 0.5).clamp(0.0, 1.0);
            let i = ((y * size + x) * 4) as usize;
            out[i + 3] = (alpha * 255.0) as u8;
        }
    }
    out
}

/// Run the tray on the main thread. `ready` gets the handle once the loop runs; `on_action`
/// receives menu picks. Never returns: `TrayHandle::exit` ends the process with code 0.
pub fn run(on_action: impl Fn(TrayAction) + 'static, ready: impl FnOnce(TrayHandle) + 'static) -> ! {
    #[allow(unused_mut)]
    let mut event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    #[cfg(target_os = "macos")]
    {
        use tao::platform::macos::{ActivationPolicy, EventLoopExtMacOS};
        // Like LSUIElement: no Dock icon, no menu bar of its own.
        event_loop.set_activation_policy(ActivationPolicy::Accessory);
        event_loop.set_dock_visibility(false);
    }
    let proxy = event_loop.create_proxy();
    let menu_proxy = proxy.clone();
    MenuEvent::set_event_handler(Some(move |e| {
        let _ = menu_proxy.send_event(UserEvent::Menu(e));
    }));

    let menu = Menu::new();
    let open = MenuItem::new(strings::TRAY_OPEN, true, None);
    let snooze = MenuItem::new("Snooze", true, None);
    let separator = PredefinedMenuItem::separator();
    let quit = MenuItem::new(strings::TRAY_QUIT, true, None);
    let _ = menu.append_items(&[&open, &separator, &quit]);
    let mut snooze_shown = false;
    let mut tray = None;
    let mut ready = Some(ready);

    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {
                let size = 36;
                let icon = Icon::from_rgba(icon_rgba(size), size, size).expect("tray icon");
                match TrayIconBuilder::new()
                    .with_menu(Box::new(menu.clone()))
                    .with_tooltip(strings::TRAY_TOOLTIP)
                    .with_icon(icon)
                    .with_icon_as_template(true)
                    .build()
                {
                    Ok(t) => tray = Some(t),
                    Err(e) => log::warn!("tray icon unavailable: {e}"),
                }
                if let Some(f) = ready.take() {
                    f(TrayHandle { proxy: proxy.clone() });
                }
            }
            Event::UserEvent(UserEvent::SetSnooze(label)) => match label {
                Some(text) => {
                    snooze.set_text(&text);
                    if !snooze_shown {
                        let _ = menu.insert(&snooze, 1);
                        snooze_shown = true;
                    }
                }
                None => {
                    if snooze_shown {
                        let _ = menu.remove(&snooze);
                        snooze_shown = false;
                    }
                }
            },
            Event::UserEvent(UserEvent::Menu(e)) => {
                if e.id == *open.id() {
                    on_action(TrayAction::Open);
                } else if e.id == *snooze.id() {
                    on_action(TrayAction::Snooze);
                } else if e.id == *quit.id() {
                    on_action(TrayAction::Quit);
                }
            }
            Event::UserEvent(UserEvent::Exit) => {
                tray.take();
                *flow = ControlFlow::Exit;
            }
            _ => {}
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icon_has_a_ring_and_transparent_corners() {
        let px = icon_rgba(48);
        let alpha = |x: u32, y: u32| px[((y * 48 + x) * 4 + 3) as usize];
        assert_eq!(alpha(0, 47), 0);
        // On the ring: centre (24, 26), radius 15 at 2 px per unit.
        assert!(alpha(24, 11) > 200);
        // Inside the dial, away from the hands.
        assert_eq!(alpha(16, 30), 0);
    }
}
