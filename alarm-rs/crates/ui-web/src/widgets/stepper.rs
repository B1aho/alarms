//! Stepper (4.4.3).

use leptos::prelude::*;

#[component]
pub fn Stepper(
    #[prop(into)] value: Signal<i64>,
    min: i64,
    max: i64,
    #[prop(into)] on_change: Callback<i64>,
    label: &'static str,
) -> impl IntoView {
    view! {
        <div role="group" aria-label=label class="stepper">
            <button
                type="button"
                aria-label="Decrease"
                disabled={move || value.get() <= min}
                on:click=move |_| on_change.run(value.get_untracked() - 1)
            >
                "−"
            </button>
            <span class="stepper-sep"></span>
            <button
                type="button"
                aria-label="Increase"
                disabled={move || value.get() >= max}
                on:click=move |_| on_change.run(value.get_untracked() + 1)
            >
                "+"
            </button>
        </div>
    }
}
