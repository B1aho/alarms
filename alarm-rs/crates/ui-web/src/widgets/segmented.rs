//! Segmented control (4.4.1): a sliding thumb over a radio group.

use leptos::prelude::*;

#[component]
pub fn Segmented<T>(
    options: Vec<(T, &'static str)>,
    #[prop(into)] value: Signal<T>,
    #[prop(into)] on_change: Callback<T>,
    label: &'static str,
    #[prop(optional)] class: &'static str,
) -> impl IntoView
where
    T: Clone + PartialEq + Send + Sync + 'static,
{
    let n = options.len();
    let opts = StoredValue::new(options.clone());
    let index = move || opts.with_value(|o| o.iter().position(|(v, _)| *v == value.get()).unwrap_or(0));
    view! {
        <div
            role="radiogroup"
            aria-label=label
            class=format!("segmented {class}")
            style=format!("grid-template-columns: repeat({n}, minmax(0, 1fr))")
        >
            <span
                aria-hidden="true"
                class="seg-thumb"
                style=move || format!("width: calc((100% - 4px) / {n}); transform: translateX({}%)", index() * 100)
            ></span>
            {options
                .into_iter()
                .map(|(v, text)| {
                    let v2 = v.clone();
                    let selected = move || value.get() == v2;
                    view! {
                        <button
                            type="button"
                            role="radio"
                            class="segment"
                            class:selected=selected.clone()
                            aria-checked=move || if selected() { "true" } else { "false" }
                            on:click=move |_| on_change.run(v.clone())
                        >
                            {text}
                        </button>
                    }
                })
                .collect_view()}
        </div>
    }
}
