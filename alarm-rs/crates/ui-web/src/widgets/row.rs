//! Grouped sections and list rows (4.3, 4.4.7).

use leptos::prelude::*;

use super::icons::{I, icon};

#[component]
pub fn Section(
    #[prop(into, optional)] header: MaybeProp<String>,
    #[prop(into, optional)] footer: MaybeProp<String>,
    #[prop(optional)] class: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <section class=format!("section {class}")>
            {move || header.get().map(|h| view! { <h2 class="section-header">{h}</h2> })}
            <div class="section-body">{children()}</div>
            {move || footer.get().map(|f| view! { <p class="section-footer">{f}</p> })}
        </section>
    }
}

/// A row with a chevron and a value on the right; opens a subpage.
#[component]
pub fn NavRow(
    label: &'static str,
    #[prop(into)] detail: Signal<String>,
    #[prop(into)] on_click: Callback<()>,
) -> impl IntoView {
    view! {
        <button type="button" class="row ios-row" on:click=move |_| on_click.run(())>
            <span class="row-label">{label}</span>
            <span class="row-detail">{move || detail.get()}</span>
            {icon(I::ChevronRight, "row-chevron")}
        </button>
    }
}

/// A row with a check mark when selected.
#[component]
pub fn CheckRow(
    #[prop(into)] label: Signal<String>,
    #[prop(into)] checked: Signal<bool>,
    #[prop(into)] on_click: Callback<()>,
    #[prop(optional)] icon_view: Option<AnyView>,
) -> impl IntoView {
    view! {
        <button type="button" class="row ios-row" on:click=move |_| on_click.run(())>
            {icon_view.map(|i| view! { <span class="row-icon">{i}</span> })}
            <span class="row-label">{move || label.get()}</span>
            {move || checked.get().then(|| icon(I::Check, "row-check"))}
        </button>
    }
}

/// A clickable row with coloured text (`Preview Wake-up`, `Delete Alarm`, `Choose a File…`).
#[component]
pub fn ActionRow(
    #[prop(into)] label: Signal<String>,
    tone: &'static str,
    #[prop(into)] on_click: Callback<()>,
    #[prop(optional)] icon_view: Option<AnyView>,
    #[prop(optional)] center: bool,
) -> impl IntoView {
    view! {
        <button type="button" class="row ios-row" class:center=center on:click=move |_| on_click.run(())>
            {icon_view.map(|i| view! { <span class="row-icon">{i}</span> })}
            <span class=format!("row-label tone-{tone}")>{move || label.get()}</span>
        </button>
    }
}

/// A static row: text on the left, anything on the right.
#[component]
pub fn Row(children: Children) -> impl IntoView {
    view! { <div class="row ios-row">{children()}</div> }
}

/// A row with a label and an inline text input on the right (4.4.7).
#[component]
pub fn InputRow(
    label: &'static str,
    placeholder: &'static str,
    #[prop(into)] value: Signal<String>,
    #[prop(into)] on_input: Callback<String>,
) -> impl IntoView {
    view! {
        <div class="row ios-row">
            <span style="flex-shrink: 0">{label}</span>
            <input
                class="row-input"
                maxlength="60"
                placeholder=placeholder
                aria-label=label
                prop:value=move || value.get()
                on:input=move |e| on_input.run(event_target_value(&e))
            />
        </div>
    }
}
