//! Line icons in the style of SF Symbols (4.4.9): stroke 1.8, round caps.

use leptos::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum I {
    Alarm,
    Stopwatch,
    Timer,
    Gear,
    Plus,
    ChevronRight,
    ChevronLeft,
    Check,
    MinusCircle,
    Bell,
    Speaker,
    Music,
    Play,
    Trash,
}

/// (inner markup, stroke width; 0 = filled shape)
fn data(i: I) -> (&'static str, f32) {
    match i {
        I::Alarm => (
            r#"<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6M4.5 4.8 7 2.8M19.5 4.8 17 2.8M7 20.2l-1.4 1.6M17 20.2l1.4 1.6"/>"#,
            1.8,
        ),
        I::Stopwatch => (
            r#"<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.4 6.6l1.3-1.3"/>"#,
            1.8,
        ),
        I::Timer => (
            r#"<path d="M12 3a9 9 0 1 1-6.4 2.6"/><path d="M12 3v3.5M12 12 8.2 8.2"/>"#,
            1.8,
        ),
        I::Gear => (
            r#"<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>"#,
            1.8,
        ),
        I::Plus => (r#"<path d="M12 5v14M5 12h14"/>"#, 2.2),
        I::ChevronRight => (r#"<path d="m9.5 6 6 6-6 6"/>"#, 2.4),
        I::ChevronLeft => (r#"<path d="m14.5 5-7 7 7 7"/>"#, 2.6),
        I::Check => (r#"<path d="m5 12.5 4.5 4.5L19 7.5"/>"#, 2.6),
        I::MinusCircle => (
            r##"<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M7 12h10" stroke="#fff" stroke-width="2.4"/>"##,
            0.0,
        ),
        I::Bell => (
            r#"<path fill="currentColor" stroke="none" d="M12 2.5a6 6 0 0 0-6 6v3.6l-1.7 3.2a.8.8 0 0 0 .7 1.2h14a.8.8 0 0 0 .7-1.2L18 12.1V8.5a6 6 0 0 0-6-6Zm-2.6 16a2.7 2.7 0 0 0 5.2 0Z"/>"#,
            0.0,
        ),
        I::Speaker => (
            r#"<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>"#,
            1.8,
        ),
        I::Music => (
            r#"<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>"#,
            1.8,
        ),
        I::Play => (
            r#"<path fill="currentColor" stroke="none" d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7Z"/>"#,
            0.0,
        ),
        I::Trash => (
            r#"<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>"#,
            1.8,
        ),
    }
}

/// An icon sized by the font size of `class` (1em × 1em).
pub fn icon(i: I, class: &'static str) -> impl IntoView {
    let (inner, sw) = data(i);
    let stroke_width = if sw > 0.0 { sw.to_string() } else { "1.8".to_string() };
    view! {
        <svg
            class=class
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width=stroke_width
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            width="1em"
            height="1em"
            inner_html=inner
        ></svg>
    }
}
