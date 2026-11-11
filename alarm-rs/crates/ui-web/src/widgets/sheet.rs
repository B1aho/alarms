//! Modal sheet (4.3, 4.6): centred card one elevation level up; Esc and the backdrop close it.

use leptos::ev;
use leptos::html;
use leptos::prelude::*;

use super::icons::{I, icon};

#[component]
pub fn Sheet(
    #[prop(into)] label: Signal<String>,
    #[prop(into)] on_close: Callback<()>,
    children: Children,
) -> impl IntoView {
    let panel = NodeRef::<html::Div>::new();
    Effect::new(move |_| {
        if let Some(p) = panel.get() {
            let _ = p.focus();
        }
    });
    let handle = window_event_listener(ev::keydown, move |e| {
        if e.key() == "Escape" {
            on_close.run(());
        }
    });
    on_cleanup(move || handle.remove());
    view! {
        <div class="sheet-wrap">
            <div class="sheet-backdrop anim-fade-in" on:click=move |_| on_close.run(())></div>
            <div
                node_ref=panel
                role="dialog"
                aria-modal="true"
                aria-label=move || label.get()
                tabindex="-1"
                class="sheet elevated anim-sheet-in"
            >
                {children()}
            </div>
        </div>
    }
}

#[component]
pub fn SheetHeader(
    #[prop(optional)] leading: Option<AnyView>,
    #[prop(into)] title: Signal<String>,
    #[prop(optional)] trailing: Option<AnyView>,
) -> impl IntoView {
    view! {
        <div class="sheet-header">
            <div>{leading}</div>
            <h2 class="sheet-title">{move || title.get()}</h2>
            <div>{trailing}</div>
        </div>
    }
}

#[component]
pub fn BackButton(#[prop(into)] on_click: Callback<()>) -> impl IntoView {
    view! {
        <button type="button" class="text-btn back" on:click=move |_| on_click.run(())>
            {icon(I::ChevronLeft, "")}
            {domain::strings::BACK}
        </button>
    }
}

/// A text button in a sheet header.
pub fn text_button(label: &'static str, bold: bool, on_click: Callback<()>) -> AnyView {
    view! {
        <button type="button" class="text-btn" class:bold=bold on:click=move |_| on_click.run(())>
            {label}
        </button>
    }
    .into_any()
}
