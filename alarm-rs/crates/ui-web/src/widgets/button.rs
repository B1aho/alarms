//! Buttons (4.4.5): text links, filled buttons, round iOS Clock buttons.

use leptos::prelude::*;

#[component]
pub fn CircleButton(
    tone: &'static str,
    #[prop(into)] on_click: Callback<()>,
    #[prop(into, optional)] disabled: Signal<bool>,
    #[prop(optional)] title: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <button
            type="button"
            class=format!("circle-btn {tone}")
            title=title
            disabled=move || disabled.get()
            on:click=move |_| on_click.run(())
        >
            <span class="circle-ring"></span>
            {children()}
        </button>
    }
}
