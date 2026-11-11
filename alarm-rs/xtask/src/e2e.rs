//! `cargo xtask e2e`: end-to-end scenarios of TZ_RUST 7 (headless daemon, fake clock — nothing
//! audible or visible) and the visual tests of `ui-web` (headless WebKit, TZ_RUST 8).
//! `cargo xtask e2e daemon` / `cargo xtask e2e visual` run one part.

use std::process::Command;

pub fn run(args: &[String]) -> Result<(), String> {
    let part = args.first().map(String::as_str).unwrap_or("all");
    if matches!(part, "all" | "daemon") {
        let mut t = crate::cargo();
        t.args([
            "test",
            "-p",
            "alarmd",
            "--test",
            "e2e",
            "--",
            "--ignored",
            "--test-threads",
            "4",
        ]);
        crate::run(t, "e2e: daemon scenarios (TZ_RUST 7)")?;
    }
    if matches!(part, "all" | "visual") {
        crate::build_web(false)?;
        let dir = crate::root().join("crates/ui-web/tests/visual");
        if !dir.join("run.mjs").exists() {
            return Err("visual tests are missing (crates/ui-web/tests/visual/run.mjs)".into());
        }
        if !dir.join("node_modules").exists() {
            let mut npm = Command::new("npm");
            npm.arg("install").current_dir(&dir);
            crate::run(npm, "npm install (visual tests)")?;
        }
        // No blur shim: headless WebKit drops `backdrop-filter` from screenshots, so the sheets
        // differ a little more than in a real window; the agreed limit is 2 % of pixels.
        let mut node = Command::new("node");
        node.arg(dir.join("run.mjs")).args(["--no-shim", "--limit", "2"]);
        crate::run(node, "e2e: visual tests (headless WebKit)")?;
    }
    println!("xtask e2e: OK");
    Ok(())
}
