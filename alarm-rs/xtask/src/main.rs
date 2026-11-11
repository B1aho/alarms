//! `cargo xtask <dev|check|arch|e2e|dist>` (TZ_RUST 1).
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

mod arch;
mod dist;
mod e2e;
mod icons;

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

pub fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .to_path_buf()
}

pub fn cargo() -> Command {
    Command::new(std::env::var("CARGO").unwrap_or_else(|_| "cargo".into()))
}

/// Run a command in the workspace root, failing with its name.
pub fn run(mut cmd: Command, what: &str) -> Result<(), String> {
    cmd.current_dir(root());
    println!("xtask: {what}");
    let status = cmd.status().map_err(|e| format!("{what}: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{what} failed ({status})"))
    }
}

/// Build the WebView bundle with trunk (`crates/ui-web/dist`).
pub fn build_web(release: bool) -> Result<(), String> {
    let mut cmd = Command::new("trunk");
    cmd.args(["build", "--offline"])
        .current_dir(root().join("crates/ui-web"));
    if release {
        cmd.arg("--release");
    }
    println!("xtask: trunk build{}", if release { " --release" } else { "" });
    let status = cmd
        .status()
        .map_err(|e| format!("trunk: {e} (install with `cargo install trunk`)"))?;
    if status.success() {
        Ok(())
    } else {
        Err("trunk build failed".into())
    }
}

fn check() -> Result<(), String> {
    build_web(false)?;
    let mut fmt = cargo();
    fmt.args(["fmt", "--all", "--check"]);
    run(fmt, "cargo fmt --check")?;
    let mut clippy = cargo();
    clippy.args([
        "clippy",
        "--workspace",
        "--all-targets",
        "--locked",
        "--",
        "-D",
        "warnings",
    ]);
    run(clippy, "cargo clippy -D warnings")?;
    let mut clippy_web = cargo();
    clippy_web.args([
        "clippy",
        "-p",
        "ui-web",
        "--target",
        "wasm32-unknown-unknown",
        "--locked",
        "--",
        "-D",
        "warnings",
    ]);
    run(clippy_web, "cargo clippy -p ui-web (wasm32) -D warnings")?;
    arch::run(&root())?;
    let mut test = cargo();
    test.args(["test", "--workspace", "--locked"]);
    run(test, "cargo test --workspace")?;
    println!("xtask check: OK");
    Ok(())
}

fn dev() -> Result<(), String> {
    build_web(false)?;
    let mut build = cargo();
    build.args(["build", "-p", "alarmd", "-p", "alarm-ui"]);
    run(build, "cargo build alarmd alarm-ui")?;
    // The client starts the daemon itself when it is not running (TZ_RUST 5.1).
    let ui = Command::new(root().join("target/debug/alarm-ui"));
    run(ui, "alarm-ui")
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("check") => check(),
        Some("arch") => arch::run(&root()),
        Some("dev") => dev(),
        Some("e2e") => e2e::run(&args[1..]),
        Some("dist") => dist::run(&args[1..]),
        Some("icons") => icons::run(),
        _ => Err("usage: cargo xtask <dev|check|arch|e2e|dist|icons>".into()),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("xtask: {e}");
            ExitCode::FAILURE
        }
    }
}
