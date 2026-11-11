//! SystemInfo adapter (TZ_RUST 6, 3.13): the OS hour cycle for `Auto`.
//! macOS: locale (`NSDateFormatter` template "j"); Windows: `LOCALE_STIMEFORMAT`; Linux: `LC_TIME`.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]
#![cfg_attr(not(any(target_os = "linux", windows)), forbid(unsafe_code))]

use app::ports::SystemInfo;
use domain::model::{HourCycle, Platform};

pub struct System {
    version: String,
}

impl System {
    pub fn new(version: &str) -> Self {
        System {
            version: version.to_string(),
        }
    }
}

/// `true` when a time pattern uses a 12-hour clock.
pub fn pattern_is_12h(pattern: &str) -> bool {
    // ICU/macOS: h, K, a; Windows: h, tt; POSIX: %I, %l, %r, %p.
    let mut quoted = false;
    for c in pattern.chars() {
        if c == '\'' {
            quoted = !quoted;
        }
        if !quoted && matches!(c, 'h' | 'K' | 'a') {
            return true;
        }
    }
    pattern.contains("%I") || pattern.contains("%l") || pattern.contains("%r") || pattern.contains("%p")
}

#[cfg(target_os = "macos")]
fn os_pattern() -> Option<String> {
    use objc2_foundation::{NSDateFormatter, NSLocale, NSString};
    let locale = NSLocale::currentLocale();
    let pattern = NSDateFormatter::dateFormatFromTemplate_options_locale(&NSString::from_str("j"), 0, Some(&locale))?;
    Some(pattern.to_string())
}

#[cfg(target_os = "linux")]
fn os_pattern() -> Option<String> {
    // SAFETY: setlocale/nl_langinfo are called with valid C strings; the result is copied at once.
    unsafe {
        libc::setlocale(libc::LC_TIME, c"".as_ptr());
        let p = libc::nl_langinfo(libc::T_FMT);
        if p.is_null() {
            return None;
        }
        Some(std::ffi::CStr::from_ptr(p).to_string_lossy().into_owned())
    }
}

#[cfg(windows)]
fn os_pattern() -> Option<String> {
    use windows_sys::Win32::Globalization::{GetLocaleInfoEx, LOCALE_STIMEFORMAT};
    let mut buf = [0u16; 128];
    // SAFETY: the buffer length is passed; a null locale name means the user default.
    let n = unsafe { GetLocaleInfoEx(std::ptr::null(), LOCALE_STIMEFORMAT, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..(n as usize).saturating_sub(1)]))
}

impl SystemInfo for System {
    fn hour_cycle(&self) -> HourCycle {
        match os_pattern() {
            Some(p) if pattern_is_12h(&p) => HourCycle::H12,
            _ => HourCycle::H24,
        }
    }

    fn platform(&self) -> Platform {
        if cfg!(target_os = "macos") {
            Platform::Macos
        } else if cfg!(windows) {
            Platform::Windows
        } else {
            Platform::Linux
        }
    }

    fn app_version(&self) -> String {
        self.version.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patterns() {
        assert!(pattern_is_12h("h:mm a"));
        assert!(pattern_is_12h("h:mm tt"));
        assert!(pattern_is_12h("%I:%M:%S %p"));
        assert!(!pattern_is_12h("HH:mm"));
        assert!(!pattern_is_12h("H 'h' mm"));
        assert!(!pattern_is_12h("%H:%M:%S"));
    }

    #[test]
    fn reads_the_os() {
        let s = System::new("1.0.0");
        let _ = s.hour_cycle();
        assert_eq!(s.app_version(), "1.0.0");
    }
}
