//! Screens (ALARM_SPEC 3, 5).

pub mod alarms;
pub mod editor;
pub mod ringing;
pub mod settings;
pub mod sound_picker;
pub mod stopwatch;
pub mod timer;

use leptos::prelude::*;

/// Large-title page header (4.3).
#[component]
pub fn PageHeader(
    title: &'static str,
    #[prop(optional)] leading: Option<AnyView>,
    #[prop(optional)] trailing: Option<AnyView>,
    #[prop(into, optional)] subtitle: MaybeProp<String>,
) -> impl IntoView {
    view! {
        <header class="page-header">
            <div class="page-actions">
                <div>{leading}</div>
                <div>{trailing}</div>
            </div>
            <h1 class="page-title">{title}</h1>
            {move || subtitle.get().map(|s| view! { <p class="page-subtitle">{s}</p> })}
        </header>
    }
}
