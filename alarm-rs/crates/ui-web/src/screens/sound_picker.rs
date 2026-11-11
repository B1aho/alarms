//! Sound chooser (3.8): your music, built-in sounds, preview by the daemon, import through the shell.

use leptos::prelude::*;
use protocol::{BuiltinSound, Command, SoundRef};

use domain::strings as s;

use crate::bridge;
use crate::state::{Import, next_owner, use_store};
use crate::widgets::icons::{I, icon};
use crate::widgets::row::{ActionRow, CheckRow, Section};

const BUILTIN: [BuiltinSound; 6] = [
    BuiltinSound::Sunrise,
    BuiltinSound::Harp,
    BuiltinSound::Chimes,
    BuiltinSound::Beacon,
    BuiltinSound::Pulse,
    BuiltinSound::Classic,
];

/// Ask the shell for a file and send it to the daemon; progress goes to `store.import`.
pub fn start_import(owner: u32) {
    let store = use_store();
    leptos::task::spawn_local(async move {
        if let Some(path) = bridge::pick_audio_file().await {
            store.import.set(Import::Adding { owner });
            store.send(Command::ImportSound { path });
        }
    });
}

#[component]
pub fn SoundPicker(
    #[prop(into)] value: Signal<SoundRef>,
    #[prop(into)] volume: Signal<f32>,
    #[prop(into)] on_change: Callback<SoundRef>,
) -> impl IntoView {
    let store = use_store();
    let owner = next_owner();
    let error = RwSignal::new(None::<String>);
    let previewing = RwSignal::new(false);

    let choose = Callback::new(move |r: SoundRef| {
        on_change.run(r.clone());
        store.send(Command::PreviewPlay {
            sound: r,
            volume: volume.get_untracked(),
            ramp_seconds: 0,
            looped: false,
        });
        previewing.set(true);
    });
    Effect::new(move |_| match store.import.get() {
        Import::Done { owner: o, id } if o == owner => {
            store.import.set(Import::Idle);
            error.set(None);
            choose.run(SoundRef::Custom(id));
        }
        Import::Failed { owner: o, message } if o == owner => {
            store.import.set(Import::Idle);
            error.set(Some(message));
        }
        _ => {}
    });
    on_cleanup(move || {
        if previewing.get_untracked() {
            store.send(Command::PreviewStop);
        }
    });
    let adding = move || matches!(store.import.get(), Import::Adding { owner: o } if o == owner);
    let customs = move || store.with(|s| s.sounds.clone()).unwrap_or_default();

    view! {
        <Section
            header=s::SECTION_YOUR_MUSIC
            footer=Signal::derive(move || error.get().unwrap_or_else(|| s::MUSIC_FOOTER.to_string()))
        >
            <For each=customs key=|c| c.id.clone() let:c>
                {
                    let r = SoundRef::Custom(c.id.clone());
                    let r2 = r.clone();
                    view! {
                        <CheckRow
                            label=c.name.clone()
                            icon_view=icon(I::Music, "tone-indigo").into_any()
                            checked=Signal::derive(move || value.get() == r)
                            on_click=Callback::new(move |_| choose.run(r2.clone()))
                        />
                    }
                }
            </For>
            <ActionRow
                label=Signal::derive(move || if adding() { s::ADDING } else { s::CHOOSE_A_FILE }.to_string())
                tone="accent"
                icon_view=icon(I::Plus, "tone-accent").into_any()
                on_click=Callback::new(move |_| {
                    error.set(None);
                    start_import(owner);
                })
            />
        </Section>
        <Section header=s::SECTION_BUILT_IN>
            {BUILTIN
                .iter()
                .map(|&b| {
                    view! {
                        <CheckRow
                            label=b.name().to_string()
                            checked=Signal::derive(move || value.get() == SoundRef::Builtin(b))
                            on_click=Callback::new(move |_| choose.run(SoundRef::Builtin(b)))
                        />
                    }
                })
                .collect_view()}
        </Section>
    }
}
