//! Banner (4.4.8).

use leptos::prelude::*;

#[component]
pub fn Banner(
    icon: AnyView,
    title: &'static str,
    body: String,
    #[prop(optional)] action: Option<AnyView>,
) -> impl IntoView {
    view! {
        <div class="banner anim-fade-in">
            <span class="banner-icon">{icon}</span>
            <div class="banner-text">
                <p class="banner-title">{title}</p>
                <p class="banner-body">{body}</p>
            </div>
            {action.map(|a| view! { <div class="banner-action">{a}</div> })}
        </div>
    }
}
