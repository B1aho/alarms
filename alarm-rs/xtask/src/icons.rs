//! `cargo xtask icons`: renders the app icon (ALARM_SPEC 4.1) to `bins/alarm-ui/icons/source.png`:
//! a rounded square (radius 22 %) with a `#2C2C2E → #000` gradient and an orange alarm clock
//! (`#FFB340 → #FF8A00`), drawn with the same strokes as the UI icon.

use std::path::Path;

fn seg(px: f32, py: f32, a: (f32, f32), b: (f32, f32)) -> f32 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let t = (((px - a.0) * dx + (py - a.1) * dy) / (dx * dx + dy * dy)).clamp(0.0, 1.0);
    ((px - a.0 - t * dx).powi(2) + (py - a.1 - t * dy).powi(2)).sqrt()
}

/// Distance (in icon units, 24-grid) to the alarm-clock strokes.
fn clock_distance(x: f32, y: f32) -> f32 {
    let ring = (((x - 12.0).powi(2) + (y - 13.0).powi(2)).sqrt() - 7.5).abs();
    [
        ((12.0, 9.0), (12.0, 13.2)),
        ((12.0, 13.2), (14.6, 14.8)),
        ((4.5, 4.8), (7.0, 2.8)),
        ((19.5, 4.8), (17.0, 2.8)),
        ((7.0, 20.2), (5.6, 21.8)),
        ((17.0, 20.2), (18.4, 21.8)),
    ]
    .iter()
    .map(|(a, b)| seg(x, y, *a, *b))
    .fold(ring, f32::min)
}

fn mix(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ]
}

pub fn render(size: u32) -> Vec<u8> {
    let s = size as f32;
    let r = 0.22 * s;
    let unit = s * 0.62 / 24.0; // the clock fills ~62 % of the tile
    let off = (s - 24.0 * unit) / 2.0;
    let stroke = 2.0 * unit / 2.0;
    let mut out = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let (px, py) = (x as f32 + 0.5, y as f32 + 0.5);
            // Rounded-square coverage.
            let qx = (px - s / 2.0).abs() - (s / 2.0 - r);
            let qy = (py - s / 2.0).abs() - (s / 2.0 - r);
            let d = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt() + qx.max(qy).min(0.0) - r;
            let tile = (0.5 - d).clamp(0.0, 1.0);
            let t = py / s;
            let bg = mix([0x2c as f32, 0x2c as f32, 0x2e as f32], [0.0, 0.0, 0.0], t);
            let fg = mix(
                [0xff as f32, 0xb3 as f32, 0x40 as f32],
                [0xff as f32, 0x8a as f32, 0.0],
                t,
            );
            let cd = clock_distance((px - off) / unit, (py - off) / unit) * unit;
            let ink = (stroke - cd + 0.5).clamp(0.0, 1.0);
            let c = mix(bg, fg, ink);
            let i = ((y * size + x) * 4) as usize;
            out[i] = c[0] as u8;
            out[i + 1] = c[1] as u8;
            out[i + 2] = c[2] as u8;
            out[i + 3] = (tile * 255.0) as u8;
        }
    }
    out
}

pub fn write_png(path: &Path, size: u32, rgba: &[u8]) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut enc = png::Encoder::new(std::io::BufWriter::new(file), size, size);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().map_err(|e| e.to_string())?;
    w.write_image_data(rgba).map_err(|e| e.to_string())
}

pub fn run() -> Result<(), String> {
    let dir = crate::root().join("bins/alarm-ui/icons");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let src = dir.join("source.png");
    write_png(&src, 1024, &render(1024))?;
    println!("xtask icons: wrote {}", src.display());
    let status = std::process::Command::new(std::env::var("CARGO").unwrap_or_else(|_| "cargo".into()))
        .args(["tauri", "icon", "icons/source.png", "-o", "icons"])
        .current_dir(crate::root().join("bins/alarm-ui"))
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("cargo tauri icon failed".into())
    }
}
