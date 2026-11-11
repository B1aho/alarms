//! iOS-style wheel picker (4.4.6), ported from `alarm/src/shared/ui/WheelPicker.tsx`.
//! Scrolling moves a native scroll container; snapping is animated with
//! `requestAnimationFrame` straight on `scrollTop`, without re-rendering the view.

use std::time::Duration;

use leptos::html;
use leptos::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{FocusOptions, KeyboardEvent, PointerEvent};

const ITEM_H: f64 = 36.0;
/// Idle time after the last wheel/trackpad scroll before the wheel settles.
const SETTLE_MS: u64 = 90;
/// Only pointer samples this recent count towards the release velocity.
const VELOCITY_WINDOW_MS: f64 = 80.0;
/// How far (in rows) a flick may carry the wheel past the release point.
const MAX_FLICK_ROWS: f64 = 6.0;

struct Drag {
    pointer_id: i32,
    start_y: f64,
    start_top: f64,
    moved: bool,
    samples: Vec<(f64, f64)>,
}

#[derive(Default)]
struct State {
    /// Dragging, settling or gliding: the outside value is not applied.
    busy: bool,
    /// Generation of the running glide; bumping it cancels the glide.
    generation: u64,
    animating: bool,
    glide_target: usize,
    settle: Option<TimeoutHandle>,
    suppress_click: bool,
    drag: Option<Drag>,
    center: usize,
}

fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

fn perf_now() -> f64 {
    web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now())
        .unwrap_or_else(js_sys::Date::now)
}

#[derive(Clone, Copy)]
struct Wheel {
    el: NodeRef<html::Div>,
    st: StoredValue<State, LocalStorage>,
    values: StoredValue<Vec<i64>>,
    value: Signal<i64>,
    on_change: Callback<i64>,
}

impl Wheel {
    fn len(&self) -> usize {
        self.values.with_value(Vec::len)
    }

    fn clamp(&self, i: f64) -> usize {
        i.round().clamp(0.0, (self.len().max(1) - 1) as f64) as usize
    }

    fn index(&self) -> usize {
        let v = self.value.get_untracked();
        self.values
            .with_value(|vs| vs.iter().position(|x| *x == v).unwrap_or(0))
    }

    fn top(&self) -> f64 {
        self.el
            .get_untracked()
            .map(|e| f64::from(e.scroll_top()))
            .unwrap_or(0.0)
    }

    fn set_top(&self, top: f64) {
        if let Some(e) = self.el.get_untracked() {
            e.set_scroll_top(top.round() as i32);
        }
    }

    /// Highlight the row under the band right away, by toggling classes.
    fn set_center(&self, i: usize) {
        let prev = self.st.with_value(|s| s.center);
        if prev == i {
            return;
        }
        self.st.update_value(|s| s.center = i);
        if let Some(e) = self.el.get_untracked() {
            let kids = e.children();
            if let Some(old) = kids.item(prev as u32 + 1) {
                let _ = old.class_list().remove_1("center");
            }
            if let Some(new) = kids.item(i as u32 + 1) {
                let _ = new.class_list().add_1("center");
            }
        }
    }

    fn clear_settle(&self) {
        if let Some(h) = self.st.try_update_value(|s| s.settle.take()).flatten() {
            h.clear();
        }
    }

    fn stop_animation(&self) {
        self.st.update_value(|s| {
            s.generation += 1;
            s.animating = false;
        });
    }

    fn commit(&self, i: usize) {
        self.st.update_value(|s| s.busy = false);
        if let Some(v) = self.values.with_value(|vs| vs.get(i).copied())
            && v != self.value.get_untracked()
        {
            self.on_change.run(v);
        }
    }

    /// Glide to row `i` and commit it.
    fn animate_to(&self, i: f64) {
        let target = self.clamp(i);
        let from = self.top();
        let to = target as f64 * ITEM_H;
        let distance = to - from;
        self.stop_animation();
        self.clear_settle();
        self.st.update_value(|s| {
            s.glide_target = target;
            s.busy = true;
        });
        if distance.abs() < 0.5 {
            self.set_top(to);
            self.commit(target);
            return;
        }
        let duration = (160.0 + distance.abs().sqrt() * 22.0).min(520.0);
        let generation = self.st.with_value(|s| s.generation);
        self.st.update_value(|s| s.animating = true);
        let w = *self;
        let start = perf_now();
        request_animation_frame(move || w.frame(generation, from, distance, duration, start, target));
    }

    fn frame(self, generation: u64, from: f64, distance: f64, duration: f64, start: f64, target: usize) {
        if self.st.with_value(|s| s.generation) != generation {
            return;
        }
        let t = ((perf_now() - start) / duration).clamp(0.0, 1.0);
        self.set_top(from + distance * ease_out_cubic(t));
        if t < 1.0 {
            request_animation_frame(move || self.frame(generation, from, distance, duration, start, target));
        } else {
            self.st.update_value(|s| s.animating = false);
            self.commit(target);
        }
    }

    fn on_scroll(&self) {
        let top = self.top();
        self.set_center(self.clamp(top / ITEM_H));
        // Our own drag and glide drive the position; only native scrolling needs settling.
        let (dragging, animating) = self
            .st
            .with_value(|s| (s.drag.as_ref().is_some_and(|d| d.moved), s.animating));
        if dragging || animating {
            return;
        }
        self.st.update_value(|s| s.busy = true);
        self.clear_settle();
        let w = *self;
        let handle = set_timeout_with_handle(move || w.animate_to(w.top() / ITEM_H), Duration::from_millis(SETTLE_MS));
        if let Ok(h) = handle {
            self.st.update_value(|s| s.settle = Some(h));
        }
    }

    fn pointer_down(&self, e: &PointerEvent) {
        if e.pointer_type() != "mouse" || e.button() != 0 {
            return;
        }
        let top = self.top();
        self.st.update_value(|s| {
            s.suppress_click = false;
            s.drag = Some(Drag {
                pointer_id: e.pointer_id(),
                start_y: f64::from(e.client_y()),
                start_top: top,
                moved: false,
                samples: vec![(f64::from(e.client_y()), e.time_stamp())],
            });
        });
    }

    fn pointer_move(&self, e: &PointerEvent) {
        let Some(el) = self.el.get_untracked() else { return };
        let y = f64::from(e.client_y());
        let top = self.top();
        let mut grabbed = false;
        let new_top = self.st.try_update_value(|s| {
            let d = s.drag.as_mut().filter(|d| d.pointer_id == e.pointer_id())?;
            let dy = y - d.start_y;
            if !d.moved {
                if dy.abs() < 4.0 {
                    return None;
                }
                d.moved = true;
                d.start_top = top - dy; // grab the wheel exactly where it is now
                grabbed = true;
            }
            d.samples.push((y, e.time_stamp()));
            while d.samples.len() > 2 && e.time_stamp() - d.samples[0].1 > VELOCITY_WINDOW_MS {
                d.samples.remove(0);
            }
            Some(d.start_top - dy)
        });
        let Some(Some(new_top)) = new_top else { return };
        if grabbed {
            self.st.update_value(|s| s.busy = true);
            self.stop_animation();
            self.clear_settle();
            let _ = el.set_pointer_capture(e.pointer_id()); // keep following outside the wheel
            let opts = FocusOptions::new();
            opts.set_prevent_scroll(true);
            let _ = el.focus_with_options(&opts);
            let _ = el.class_list().add_1("dragging");
        }
        e.prevent_default();
        self.set_top(new_top);
    }

    fn end_drag(&self, e: &PointerEvent) {
        let Some(d) = self.st.try_update_value(|s| {
            if s.drag.as_ref().is_some_and(|d| d.pointer_id == e.pointer_id()) {
                s.drag.take()
            } else {
                None
            }
        }) else {
            return;
        };
        let Some(d) = d else { return };
        let Some(el) = self.el.get_untracked() else { return };
        let _ = el.class_list().remove_1("dragging");
        if !d.moved {
            return;
        }
        self.st.update_value(|s| s.suppress_click = true);
        if el.has_pointer_capture(e.pointer_id()) {
            let _ = el.release_pointer_capture(e.pointer_id());
        }
        // Velocity over the last few dozen ms only: a pause or a change of direction means no flick.
        let now = e.time_stamp();
        let recent: Vec<&(f64, f64)> = d.samples.iter().filter(|s| now - s.1 <= VELOCITY_WINDOW_MS).collect();
        let mut rows = 0.0;
        if recent.len() >= 2 {
            let (first, last) = (recent[0], recent[recent.len() - 1]);
            let same_direction = recent.windows(2).all(|w| (w[1].0 - w[0].0) * (last.0 - first.0) >= 0.0);
            let v = (last.0 - first.0) / (last.1 - first.1).max(16.0); // px per ms, + = downwards
            if v.abs() > 0.3 && same_direction {
                rows = (-v * 110.0 / ITEM_H).clamp(-MAX_FLICK_ROWS, MAX_FLICK_ROWS);
            }
        }
        self.animate_to(self.top() / ITEM_H + rows);
    }

    fn key(&self, e: &KeyboardEvent) {
        // Repeated presses during a glide continue from where the wheel is heading.
        let base = self.st.with_value(|s| {
            if s.animating {
                s.glide_target
            } else if s.busy {
                s.center
            } else {
                self.index()
            }
        }) as f64;
        let last = (self.len().max(1) - 1) as f64;
        let to = match e.key().as_str() {
            "ArrowDown" => base + 1.0,
            "ArrowUp" => base - 1.0,
            "PageDown" => base + 5.0,
            "PageUp" => base - 5.0,
            "Home" => 0.0,
            "End" => last,
            _ => return,
        };
        e.prevent_default();
        self.animate_to(to);
    }

    fn click(&self, i: usize) {
        let suppressed = self.st.with_value(|s| s.suppress_click);
        if suppressed {
            self.st.update_value(|s| s.suppress_click = false);
            return;
        }
        self.animate_to(i as f64);
    }
}

#[component]
pub fn WheelPicker(
    items: Vec<(i64, String)>,
    #[prop(into)] value: Signal<i64>,
    #[prop(into)] on_change: Callback<i64>,
    label: &'static str,
    width: u32,
    #[prop(default = "center")] align: &'static str,
) -> impl IntoView {
    let el = NodeRef::<html::Div>::new();
    let values = StoredValue::new(items.iter().map(|(v, _)| *v).collect::<Vec<_>>());
    let initial = {
        let v = value.get_untracked();
        items.iter().position(|(x, _)| *x == v).unwrap_or(0)
    };
    let st = StoredValue::new_local(State {
        center: initial,
        glide_target: initial,
        ..State::default()
    });
    let w = Wheel {
        el,
        st,
        values,
        value,
        on_change,
    };

    // Keep the wheel on the value when it changes from outside (and once mounted).
    Effect::new(move |_| {
        let v = value.get();
        let Some(e) = el.get() else { return };
        let idx = values.with_value(|vs| vs.iter().position(|x| *x == v).unwrap_or(0));
        if st.with_value(|s| s.busy) {
            return;
        }
        if (f64::from(e.scroll_top()) - idx as f64 * ITEM_H).abs() > 0.5 {
            e.set_scroll_top((idx as f64 * ITEM_H) as i32);
        }
        w.set_center(idx);
    });
    on_cleanup(move || {
        w.stop_animation();
        w.clear_settle();
    });

    let selected = move |i: usize| values.with_value(|vs| vs.get(i).copied()) == Some(value.get());
    view! {
        <div
            node_ref=el
            role="listbox"
            aria-label=label
            tabindex="0"
            class=format!("wheel align-{align}")
            style=format!("width: {width}px")
            on:scroll=move |_| w.on_scroll()
            on:wheel=move |_| w.stop_animation()
            on:keydown=move |e| w.key(&e)
            on:pointerdown=move |e| w.pointer_down(&e)
            on:pointermove=move |e| w.pointer_move(&e)
            on:pointerup=move |e| w.end_drag(&e)
            on:pointercancel=move |e| w.end_drag(&e)
            on:lostpointercapture=move |e| w.end_drag(&e.unchecked_into())
            on:dragstart=move |e| e.prevent_default()
        >
            <div class="wheel-pad"></div>
            {items
                .into_iter()
                .enumerate()
                .map(|(i, (_, text))| {
                    view! {
                        <div
                            role="option"
                            class=if i == initial { "wheel-item center" } else { "wheel-item" }
                            aria-selected=move || if selected(i) { "true" } else { "false" }
                            on:click=move |_| w.click(i)
                        >
                            {text}
                        </div>
                    }
                })
                .collect_view()}
            <div class="wheel-pad"></div>
        </div>
    }
}

/// Wheels over a shared selection band.
#[component]
pub fn WheelGroup(#[prop(optional)] class: &'static str, children: Children) -> impl IntoView {
    view! {
        <div class=format!("wheel-group {class}")>
            <div aria-hidden="true" class="wheel-band"></div>
            {children()}
        </div>
    }
}

pub fn range_items(from: i64, to: i64, pad: bool) -> Vec<(i64, String)> {
    (from..=to)
        .map(|v| (v, if pad { format!("{v:02}") } else { v.to_string() }))
        .collect()
}
