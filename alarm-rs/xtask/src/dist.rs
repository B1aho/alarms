//! `cargo xtask dist`: installers (TZ_RUST 9).
//!
//! macOS (verified here): `Alarm.app` with `alarm-ui` as the main program; the daemon is a nested
//! helper app `Contents/Library/Helpers/alarmd.app` (own bundle id, `LSUIElement`), which carries
//! the LaunchAgent plist for `SMAppService` in its `Contents/Library/LaunchAgents/`; ad-hoc
//! signature (pass `--sign "<identity>"` and notarize for distribution), and `Alarm.dmg`.
//! Windows / Linux: `tauri bundle` with `alarmd` as an external binary (`.msi`; `.AppImage`, `.deb`).

use std::path::Path;
use std::process::Command;

const LABEL: &str = "org.alarmrs.alarmd";
const BUNDLE_ID: &str = "org.alarmrs.Alarm";
const DAEMON_ID: &str = "org.alarmrs.Alarm.daemon";

fn helper_info_plist(version: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>alarmd</string>
    <key>CFBundleIdentifier</key>
    <string>{DAEMON_ID}</string>
    <key>CFBundleName</key>
    <string>Alarm</string>
    <key>CFBundleDisplayName</key>
    <string>Alarm</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>{version}</string>
    <key>CFBundleVersion</key>
    <string>{version}</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"#
    )
}

fn host_triple() -> Result<String, String> {
    let out = Command::new("rustc").arg("-vV").output().map_err(|e| e.to_string())?;
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .find_map(|l| l.strip_prefix("host: ").map(str::to_string))
        .ok_or_else(|| "cannot read the host triple".into())
}

fn agent_plist() -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{LABEL}</string>
    <key>BundleProgram</key>
    <string>Contents/MacOS/alarmd</string>
    <key>AssociatedBundleIdentifiers</key>
    <array>
        <string>{BUNDLE_ID}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>1</integer>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
</dict>
</plist>
"#
    )
}

fn copy(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::copy(from, to)
        .map(|_| ())
        .map_err(|e| format!("copy {} → {}: {e}", from.display(), to.display()))
}

pub fn run(args: &[String]) -> Result<(), String> {
    let root = crate::root();
    let identity = args
        .iter()
        .position(|a| a == "--sign")
        .and_then(|i| args.get(i + 1))
        .cloned();
    crate::build_web(true)?;
    let mut daemon = crate::cargo();
    daemon.args(["build", "--release", "-p", "alarmd"]);
    crate::run(daemon, "cargo build --release -p alarmd")?;
    let ui_dir = root.join("bins/alarm-ui");

    if cfg!(target_os = "macos") {
        let mut tauri = crate::cargo();
        tauri.args(["tauri", "build", "--bundles", "app"]).current_dir(&ui_dir);
        let status = tauri.status().map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("cargo tauri build failed".into());
        }
        let bundle_dir = root.join("target/release/bundle/macos");
        let app = bundle_dir.join("Alarm.app");
        let helper = app.join("Contents/Library/Helpers/alarmd.app/Contents");
        let _ = std::fs::remove_dir_all(app.join("Contents/Library/Helpers"));
        for sub in ["MacOS", "Resources", "Library/LaunchAgents"] {
            std::fs::create_dir_all(helper.join(sub)).map_err(|e| e.to_string())?;
        }
        copy(&root.join("target/release/alarmd"), &helper.join("MacOS/alarmd"))?;
        copy(&ui_dir.join("icons/icon.icns"), &helper.join("Resources/icon.icns"))?;
        std::fs::write(helper.join("Info.plist"), helper_info_plist(env!("CARGO_PKG_VERSION")))
            .map_err(|e| e.to_string())?;
        std::fs::write(
            helper.join(format!("Library/LaunchAgents/{LABEL}.plist")),
            agent_plist(),
        )
        .map_err(|e| e.to_string())?;
        let id = identity.unwrap_or_else(|| "-".into());
        // Inside out: the helper first, then the main bundle.
        for target in [app.join("Contents/Library/Helpers/alarmd.app"), app.clone()] {
            let mut sign = Command::new("codesign");
            sign.args(["--force", "--options", "runtime", "--sign", &id])
                .arg(&target);
            crate::run(
                sign,
                &format!(
                    "codesign {} ({})",
                    target.display(),
                    if id == "-" { "ad-hoc" } else { &id }
                ),
            )?;
        }
        let dmg = bundle_dir.join("Alarm.dmg");
        let stage = bundle_dir.join("dmg-stage");
        let _ = std::fs::remove_dir_all(&stage);
        std::fs::create_dir_all(&stage).map_err(|e| e.to_string())?;
        let mut cp = Command::new("ditto");
        cp.arg(&app).arg(stage.join("Alarm.app"));
        crate::run(cp, "stage Alarm.app")?;
        let _ = std::os::unix::fs::symlink("/Applications", stage.join("Applications"));
        let _ = std::fs::remove_file(&dmg);
        let mut hd = Command::new("hdiutil");
        hd.args([
            "create",
            "-volname",
            "Alarm",
            "-fs",
            "HFS+",
            "-format",
            "UDZO",
            "-srcfolder",
        ])
        .arg(&stage)
        .arg(&dmg);
        crate::run(hd, "hdiutil create Alarm.dmg")?;
        let _ = std::fs::remove_dir_all(&stage);
        println!("xtask dist: {}\nxtask dist: {}", app.display(), dmg.display());
        return Ok(());
    }

    // Windows and Linux: alarmd travels as a Tauri external binary.
    let triple = host_triple()?;
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let bin_dir = ui_dir.join("binaries");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    copy(
        &root.join(format!("target/release/alarmd{ext}")),
        &bin_dir.join(format!("alarmd-{triple}{ext}")),
    )?;
    let bundles = if cfg!(windows) { "msi" } else { "appimage,deb" };
    let mut tauri = crate::cargo();
    tauri
        .args([
            "tauri",
            "build",
            "--bundles",
            bundles,
            "--config",
            r#"{"bundle":{"externalBin":["binaries/alarmd"]}}"#,
        ])
        .current_dir(&ui_dir);
    let status = tauri.status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("cargo tauri build failed".into())
    }
}
