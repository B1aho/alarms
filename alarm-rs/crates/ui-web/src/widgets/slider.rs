//! Slider (4.4.4): blue filled track, white 28 px knob.

use leptos::prelude::*;

use super::icons::{I, icon};

#[component]
pub fn Slider(
    #[prop(into)] value: Signal<f32>,
    min: f32,
    max: f32,
    step: f32,
    #[prop(into)] on_change: Callback<f32>,
    label: &'static str,
) -> impl IntoView {
    view! {
        <input
            type="range"
            class="ios-slider"
            aria-label=label
            min=min.to_string()
            max=max.to_string()
            step=step.to_string()
            prop:value=move || value.get().to_string()
            style=move || format!("--fill-pct: {}%", (value.get() - min) / (max - min) * 100.0)
            on:input=move |e| {
                if let Ok(v) = event_target_value(&e).parse::<f32>() {
                    on_change.run((v * 100.0).round() / 100.0);
                }
            }
        />
    }
}

/// The volume row: small speaker, slider, big speaker.
#[component]
pub fn VolumeRow(
    #[prop(into)] value: Signal<f32>,
    #[prop(into)] on_change: Callback<f32>,
    label: &'static str,
) -> impl IntoView {
    view! {
        <div class="row ios-row">
            {icon(I::Speaker, "speaker-small")}
            <Slider value=value min=0.05 max=1.0 step=0.05 on_change=on_change label=label />
            {icon(I::Speaker, "speaker-big")}
        </div>
    }
}
