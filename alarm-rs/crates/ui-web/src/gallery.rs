//! Widget test page (`?gallery=1`): every component of 4.4 on one page.

use leptos::prelude::*;
use protocol::Theme;

use crate::widgets::banner::Banner;
use crate::widgets::button::CircleButton;
use crate::widgets::icons::{I, icon};
use crate::widgets::row::{ActionRow, CheckRow, InputRow, NavRow, Row, Section};
use crate::widgets::segmented::Segmented;
use crate::widgets::sheet::{Sheet, SheetHeader, text_button};
use crate::widgets::slider::VolumeRow;
use crate::widgets::stepper::Stepper;
use crate::widgets::switch::Switch;
use crate::widgets::wheel_picker::{WheelGroup, WheelPicker, range_items};

#[component]
pub fn Gallery() -> impl IntoView {
    let on = RwSignal::new(true);
    let seg = RwSignal::new(Theme::System);
    let step = RwSignal::new(2i64);
    let vol = RwSignal::new(0.9f32);
    let hour = RwSignal::new(7i64);
    let minute = RwSignal::new(30i64);
    let checked = RwSignal::new(true);
    let text = RwSignal::new(String::new());
    let sheet = RwSignal::new(false);
    let close = Callback::new(move |_| sheet.set(false));
    view! {
        <main class="content gallery">
            <h1 class="page-title">"Widgets"</h1>
            <h2>"Wheel picker (4.4.6)"</h2>
            <WheelGroup>
                <WheelPicker label="Hour" items=range_items(0, 23, true) value=hour on_change=Callback::new(move |v| hour.set(v)) align="right" width=72 />
                <span class="wheel-colon">":"</span>
                <WheelPicker label="Minute" items=range_items(0, 59, true) value=minute on_change=Callback::new(move |v| minute.set(v)) align="left" width=72 />
            </WheelGroup>
            <p class="section-footer" data-testid="wheel-value">{move || format!("{:02}:{:02}", hour.get(), minute.get())}</p>
            <h2>"Segmented, switch, stepper (4.4.1–4.4.3)"</h2>
            <div class="stack">
                <Segmented class="w-220" label="Theme" options=vec![(Theme::System, "Auto"), (Theme::Light, "Light"), (Theme::Dark, "Dark")] value=seg on_change=Callback::new(move |v| seg.set(v)) />
                <Switch checked=on label="Switch".to_string() on_change=Callback::new(move |v| on.set(v)) />
                <Stepper value=step min=1 max=5 label="Stepper" on_change=Callback::new(move |v| step.set(v)) />
                <span>{move || step.get()}</span>
            </div>
            <h2>"Buttons (4.4.5)"</h2>
            <div class="stack">
                <button type="button" class="text-btn">"Cancel"</button>
                <button type="button" class="text-btn bold">"Save"</button>
                <button type="button" class="text-btn red">"Delete"</button>
                <button type="button" class="filled-btn accent">"Add Alarm"</button>
                <button type="button" class="filled-btn gray">"Repeat"</button>
                <button type="button" class="filled-btn red">"Red"</button>
                <button type="button" class="filled-btn indigo">"Indigo"</button>
                <button type="button" class="filled-btn accent" disabled=true>"Disabled"</button>
                <button type="button" class="icon-btn" aria-label="Add alarm">{icon(I::Plus, "")}</button>
            </div>
            <div class="stack" style="margin-top: 16px">
                <CircleButton tone="green" on_click=Callback::new(|_| ())>"Start"</CircleButton>
                <CircleButton tone="red" on_click=Callback::new(|_| ())>"Stop"</CircleButton>
                <CircleButton tone="orange" on_click=Callback::new(|_| ())>"Pause"</CircleButton>
                <CircleButton tone="gray" on_click=Callback::new(|_| ())>"Lap"</CircleButton>
                <CircleButton tone="gray" disabled=Signal::derive(|| true) on_click=Callback::new(|_| ())>"Reset"</CircleButton>
            </div>
            <h2>"Rows and slider (4.4.4, 4.4.7)"</h2>
            <Section header="SECTION" footer="Footer text.">
                <NavRow label="Repeat" detail="Weekdays".to_string() on_click=Callback::new(|_| ()) />
                <InputRow label="Label" placeholder="Alarm" value=text on_input=Callback::new(move |v| text.set(v)) />
                <CheckRow label="Every Monday".to_string() checked=checked on_click=Callback::new(move |_| checked.update(|c| *c = !*c)) />
                <CheckRow label="My Song".to_string() checked=Signal::derive(|| false) icon_view=icon(I::Music, "tone-indigo").into_any() on_click=Callback::new(|_| ()) />
                <VolumeRow value=vol on_change=Callback::new(move |v| vol.set(v)) label="Volume" />
                <Row><span class="row-text">"Snooze"</span><Switch checked=on label="Snooze".to_string() on_change=Callback::new(move |v| on.set(v)) /></Row>
                <ActionRow label="Preview Wake-up".to_string() tone="accent" on_click=Callback::new(|_| ()) />
                <ActionRow label="Open sheet".to_string() tone="accent" icon_view=icon(I::Plus, "tone-accent").into_any() on_click=Callback::new(move |_| sheet.set(true)) />
                <ActionRow label="Delete Alarm".to_string() tone="red" on_click=Callback::new(|_| ()) />
            </Section>
            <h2>"Banner (4.4.8) and icons (4.4.9)"</h2>
            <Banner icon=icon(I::Bell, "tone-accent").into_any() title="Allow Notifications" body="Banner body text.".to_string() action=view! { <button type="button" class="filled-btn accent pill">"Turn On"</button> }.into_any() />
            <div class="stack" style="font-size: 24px">
                {[I::Alarm, I::Stopwatch, I::Timer, I::Gear, I::Plus, I::ChevronLeft, I::ChevronRight, I::Check, I::MinusCircle, I::Bell, I::Speaker, I::Music, I::Play, I::Trash]
                    .into_iter()
                    .map(|i| icon(i, ""))
                    .collect_view()}
            </div>
            <Show when=move || sheet.get()>
                <Sheet label="Sheet".to_string() on_close=close>
                    <SheetHeader leading=text_button("Cancel", false, close) title="Sheet".to_string() trailing=text_button("Done", true, close) />
                    <div class="sheet-body"><Section><NavRow label="Sound" detail="Sunrise".to_string() on_click=Callback::new(|_| ()) /></Section></div>
                </Sheet>
            </Show>
        </main>
    }
}
