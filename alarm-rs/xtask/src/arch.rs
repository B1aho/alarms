//! `cargo xtask arch`: checks the crate graph against the dependency rules of TZ_RUST 5.5.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Layer {
    Domain,
    App,
    Protocol,
    Adapter,
    Composition,
    ClientShell,
    ClientView,
    Tooling,
}

fn layer_of(name: &str, manifest: &Path) -> Option<Layer> {
    let p = manifest.to_string_lossy();
    Some(match name {
        "domain" => Layer::Domain,
        "app" => Layer::App,
        "protocol" => Layer::Protocol,
        "ui-web" => Layer::ClientView,
        "alarmd" => Layer::Composition,
        "alarm-ui" => Layer::ClientShell,
        "xtask" => Layer::Tooling,
        _ if p.contains("/crates/adapters/") => Layer::Adapter,
        _ => return None,
    })
}

/// Internal crates a layer may depend on (TZ_RUST 5.5).
fn allowed_internal(layer: Layer, name: &str, dep: &str, dep_layer: Layer) -> bool {
    match layer {
        Layer::Domain => false,
        Layer::App => dep == "domain",
        Layer::Protocol => dep == "domain",
        Layer::Adapter => dep == "app" || dep == "domain" || (name == "ipc-server" && dep == "protocol"),
        Layer::Composition => !matches!(dep_layer, Layer::ClientShell | Layer::ClientView | Layer::Tooling),
        Layer::ClientShell => dep == "protocol",
        Layer::ClientView => dep == "protocol" || dep == "domain",
        Layer::Tooling => false,
    }
}

/// External crates a layer may depend on; `None` = no restriction.
fn allowed_external(layer: Layer) -> Option<&'static [&'static str]> {
    match layer {
        Layer::Domain => Some(&["jiff", "serde", "rand_core"]),
        Layer::App => Some(&[]),
        Layer::Protocol => Some(&["serde"]),
        _ => None,
    }
}

/// Modules of `domain` the client view may use (TZ_RUST 5.5).
const UI_WEB_DOMAIN_PATHS: [&str; 4] = [
    "domain::format",
    "domain::strings",
    "domain::tasks",
    "domain::schedule::repeat_summary",
];

/// Crates allowed to contain `unsafe` (OS adapters, TZ_RUST 4).
const OS_ADAPTERS: [&str; 5] = ["notify", "login", "sysinfo", "power", "tray"];

pub fn run(root: &Path) -> Result<(), String> {
    let out = Command::new(std::env::var("CARGO").unwrap_or_else(|_| "cargo".into()))
        .args(["metadata", "--format-version", "1", "--locked"])
        .current_dir(root)
        .output()
        .map_err(|e| format!("cargo metadata: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "cargo metadata failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let meta: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let mut errors = Vec::new();

    let members: BTreeSet<String> = meta["workspace_members"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    let packages = meta["packages"].as_array().cloned().unwrap_or_default();
    let mut ws: BTreeMap<String, (Layer, PathBuf, Value)> = BTreeMap::new();
    for p in &packages {
        let id = p["id"].as_str().unwrap_or_default();
        if !members.contains(id) {
            continue;
        }
        let name = p["name"].as_str().unwrap_or_default().to_string();
        let manifest = PathBuf::from(p["manifest_path"].as_str().unwrap_or_default());
        match layer_of(&name, &manifest) {
            Some(layer) => {
                ws.insert(name, (layer, manifest, p.clone()));
            }
            None => errors.push(format!("crate `{name}` is not in any layer of TZ_RUST 5.5")),
        }
    }

    // 1. Direct dependency edges.
    for (name, (layer, _, pkg)) in &ws {
        for dep in pkg["dependencies"].as_array().into_iter().flatten() {
            let dep_name = dep["name"].as_str().unwrap_or_default();
            let kind = dep["kind"].as_str().unwrap_or("normal");
            if let Some((dep_layer, _, _)) = ws.get(dep_name) {
                if !allowed_internal(*layer, name, dep_name, *dep_layer) {
                    errors.push(format!(
                        "`{name}` ({layer:?}) must not depend on `{dep_name}` ({dep_layer:?})"
                    ));
                }
            } else if kind != "dev"
                && let Some(allowed) = allowed_external(*layer)
                && !allowed.contains(&dep_name)
            {
                errors.push(format!(
                    "`{name}` ({layer:?}) must not depend on external crate `{dep_name}`"
                ));
            }
        }
    }

    // 2. `domain` and `app` compile without tokio (normal dependency closure).
    let nodes: BTreeMap<String, Vec<(String, bool)>> = meta["resolve"]["nodes"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|n| {
            let deps = n["deps"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|d| {
                    let normal = d["dep_kinds"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|k| k["kind"].is_null() || k["kind"].as_str() == Some("normal"));
                    (d["pkg"].as_str().unwrap_or_default().to_string(), normal)
                })
                .collect();
            (n["id"].as_str().unwrap_or_default().to_string(), deps)
        })
        .collect();
    let id_name: BTreeMap<String, String> = packages
        .iter()
        .map(|p| {
            (
                p["id"].as_str().unwrap_or_default().to_string(),
                p["name"].as_str().unwrap_or_default().to_string(),
            )
        })
        .collect();
    for pure in ["domain", "app", "protocol"] {
        let Some(id) = id_name
            .iter()
            .find(|(id, n)| n.as_str() == pure && members.contains(*id))
            .map(|(id, _)| id)
        else {
            continue;
        };
        let mut seen = BTreeSet::new();
        let mut stack = vec![id.clone()];
        while let Some(cur) = stack.pop() {
            if !seen.insert(cur.clone()) {
                continue;
            }
            for (dep, normal) in nodes.get(&cur).into_iter().flatten() {
                if *normal {
                    stack.push(dep.clone());
                }
            }
        }
        for forbidden in ["tokio", "async-std", "std-fs", "rusqlite", "tauri"] {
            if seen
                .iter()
                .any(|id| id_name.get(id).map(String::as_str) == Some(forbidden))
            {
                errors.push(format!(
                    "`{pure}` must compile without `{forbidden}` (found in its dependency tree)"
                ));
            }
        }
    }

    // 3. Source rules: purity lints, `forbid(unsafe_code)`, the client view's use of `domain`.
    for (name, (layer, manifest, _)) in &ws {
        let dir = manifest.parent().unwrap_or(Path::new("."));
        let entry = if dir.join("src/lib.rs").exists() {
            dir.join("src/lib.rs")
        } else {
            dir.join("src/main.rs")
        };
        let text = std::fs::read_to_string(&entry).unwrap_or_default();
        if matches!(layer, Layer::Domain | Layer::App)
            && !text.contains("#![deny(clippy::disallowed_methods, clippy::disallowed_types)]")
        {
            errors.push(format!(
                "`{name}` must deny clippy::disallowed_methods and clippy::disallowed_types"
            ));
        }
        if !OS_ADAPTERS.contains(&name.as_str()) && !text.contains("#![forbid(unsafe_code)]") {
            errors.push(format!("`{name}` must declare #![forbid(unsafe_code)]"));
        }
        if *layer == Layer::ClientView {
            for file in rust_files(&dir.join("src")) {
                let src = std::fs::read_to_string(&file).unwrap_or_default();
                for (i, line) in src.lines().enumerate() {
                    let mut rest = line;
                    while let Some(pos) = rest.find("domain::") {
                        let tail = &rest[pos..];
                        if !UI_WEB_DOMAIN_PATHS.iter().any(|p| tail.starts_with(p)) && !tail.starts_with("domain::{") {
                            errors.push(format!(
                                "{}:{}: ui-web may use only {} from domain",
                                file.display(),
                                i + 1,
                                UI_WEB_DOMAIN_PATHS.join(", ")
                            ));
                        }
                        if tail.starts_with("domain::{") {
                            errors.push(format!(
                                "{}:{}: import domain modules one path at a time",
                                file.display(),
                                i + 1
                            ));
                        }
                        rest = &tail["domain::".len()..];
                    }
                }
            }
        }
    }

    if errors.is_empty() {
        println!("xtask arch: {} crates, dependency rules of TZ_RUST 5.5 hold", ws.len());
        Ok(())
    } else {
        for e in &errors {
            eprintln!("arch: {e}");
        }
        Err(format!("{} architecture violation(s)", errors.len()))
    }
}

fn rust_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                out.extend(rust_files(&p));
            } else if p.extension().is_some_and(|x| x == "rs") {
                out.push(p);
            }
        }
    }
    out
}
