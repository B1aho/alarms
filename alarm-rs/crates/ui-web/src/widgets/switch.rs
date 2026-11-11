//! Switch (4.4.2).

use leptos::prelude::*;

#[component]
pub fn Switch(
    #[prop(into)] checked: Signal<bool>,
    #[prop(into)] on_change: Callback<bool>,
    #[prop(into)] label: Signal<String>,
) -> impl IntoView {
    view! {
        <button
            type="button"
            role="switch"
            class="switch"
            class:on=move || checked.get()
            aria-checked=move || if checked.get() { "true" } else { "false" }
            aria-label=move || label.get()
            on:click=move |e| {
                e.stop_propagation();
                on_change.run(!checked.get_untracked());
            }
        >
            <span class="switch-knob"></span>
        </button>
    }
}
