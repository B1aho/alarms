//! LoginItem adapter (TZ_RUST 3.4, 4, 5.1, 9): starts `alarmd` at login and restarts it after a crash.
//!
//! - macOS, inside `Alarm.app`: `SMAppService` agent from `Contents/Library/LaunchAgents/<label>.plist`.
//!   Outside a bundle (development): the same LaunchAgent written to `~/Library/LaunchAgents/` and
//!   loaded with `launchctl`.
//! - Linux: `systemd --user` unit `alarmd.service` (`Restart=on-failure`); without systemd an
//!   XDG autostart `.desktop` file.
//! - Windows: a Task Scheduler task "at logon" restarting on failure; fallback `HKCU\…\Run`.
//!
//! The agent restarts the daemon only after a crash (`KeepAlive = { SuccessfulExit = false }`).
//! Turning the setting off must not stop the running daemon (TZ_RUST 7): on macOS the plist is
//! removed and the job disabled for the next login instead of booting it out.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::path::{Path, PathBuf};
use std::process::Command;

use app::ports::{LoginItem, PortError, PortResult};

/// Default launchd label / unit name.
pub const DEFAULT_LABEL: &str = "org.alarmrs.alarmd";

pub struct LoginAgent {
    label: String,
    exe: PathBuf,
    args: Vec<String>,
    enabled: bool,
}

fn err(e: impl std::fmt::Display) -> PortError {
    PortError(e.to_string())
}

impl LoginAgent {
    /// `enabled = false`: never touch the OS (tests, headless e2e, `--no-login-item`).
    pub fn new(label: &str, exe: &Path, args: Vec<String>, enabled: bool) -> Self {
        LoginAgent {
            label: label.to_string(),
            exe: exe.to_path_buf(),
            args,
            enabled,
        }
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    /// Was this process started by the login agent?
    pub fn is_managed_process(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            std::env::var("XPC_SERVICE_NAME").is_ok_and(|v| v == self.label)
        }
        #[cfg(target_os = "linux")]
        {
            std::env::var("INVOCATION_ID").is_ok() && std::env::var("ALARMD_SYSTEMD").is_ok()
        }
        #[cfg(windows)]
        {
            std::env::var("ALARMD_TASK").is_ok()
        }
    }

    /// Ask the agent to start the daemon now (used when the daemon was started by hand while the
    /// agent exists, so that the crash-restart guarantee applies). Returns `true` on success.
    pub fn start_managed(&self) -> bool {
        if !self.enabled {
            return false;
        }
        #[cfg(target_os = "macos")]
        {
            let target = format!("gui/{}/{}", uid(), self.label);
            Command::new("launchctl")
                .args(["kickstart", &target])
                .status()
                .is_ok_and(|s| s.success())
        }
        #[cfg(target_os = "linux")]
        {
            Command::new("systemctl")
                .args(["--user", "start", "alarmd.service"])
                .status()
                .is_ok_and(|s| s.success())
        }
        #[cfg(windows)]
        {
            Command::new("schtasks")
                .args(["/Run", "/TN", &self.label])
                .status()
                .is_ok_and(|s| s.success())
        }
    }

    /// The LaunchAgent plist (also shipped in the bundle by `cargo xtask dist`).
    pub fn plist(label: &str, program: &[String], bundle_program: Option<&str>) -> String {
        let args: String = program
            .iter()
            .map(|a| format!("        <string>{}</string>\n", xml_escape(a)))
            .collect::<String>();
        let program_key = match bundle_program {
            Some(p) => format!("    <key>BundleProgram</key>\n    <string>{}</string>\n", xml_escape(p)),
            None => String::new(),
        };
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
{program_key}    <key>ProgramArguments</key>
    <array>
{args}    </array>
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
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

#[cfg(unix)]
fn uid() -> String {
    std::env::var("UID").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| {
        Command::new("id")
            .arg("-u")
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|| "501".into())
    })
}

// ------------------------------------------------------------------ macOS --

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use objc2_foundation::NSString;
    use objc2_service_management::{SMAppService, SMAppServiceStatus};

    /// `…/Alarm.app/Contents` when the daemon runs from a bundle that ships the agent plist.
    pub fn bundle_contents(exe: &Path, label: &str) -> Option<PathBuf> {
        let macos = exe.parent()?;
        let contents = macos.parent()?;
        let plist = contents.join("Library/LaunchAgents").join(format!("{label}.plist"));
        (macos.file_name()? == "MacOS" && plist.exists()).then(|| contents.to_path_buf())
    }

    pub fn set_bundle(label: &str, on: bool) -> PortResult<()> {
        let name = NSString::from_str(&format!("{label}.plist"));
        // SAFETY: SMAppService class methods with a valid NSString; called on any thread.
        unsafe {
            let service = SMAppService::agentServiceWithPlistName(&name);
            let status = service.status();
            if on {
                if status == SMAppServiceStatus::Enabled {
                    return Ok(());
                }
                service
                    .registerAndReturnError()
                    .map_err(|e| err(e.localizedDescription()))?;
                log::info!("login agent registered (SMAppService), status {:?}", service.status());
            } else if status == SMAppServiceStatus::Enabled || status == SMAppServiceStatus::RequiresApproval {
                // Unregistering an agent ends its job; the running daemon hands over first (see alarmd).
                service
                    .unregisterAndReturnError()
                    .map_err(|e| err(e.localizedDescription()))?;
                log::info!("login agent unregistered (SMAppService)");
            }
        }
        Ok(())
    }

    pub fn plist_path(label: &str) -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        Path::new(&home)
            .join("Library/LaunchAgents")
            .join(format!("{label}.plist"))
    }

    pub fn set_plist(agent: &LoginAgent, on: bool) -> PortResult<()> {
        let path = plist_path(&agent.label);
        let domain = format!("gui/{}", uid());
        let service = format!("{domain}/{}", agent.label);
        if on {
            let mut program = vec![agent.exe.to_string_lossy().into_owned()];
            program.extend(agent.args.iter().cloned());
            let text = LoginAgent::plist(&agent.label, &program, None);
            if std::fs::read_to_string(&path).ok().as_deref() != Some(text.as_str()) {
                std::fs::create_dir_all(path.parent().unwrap_or(Path::new("."))).map_err(err)?;
                std::fs::write(&path, &text).map_err(err)?;
            }
            let _ = Command::new("launchctl").args(["enable", &service]).status();
            // Fails harmlessly with "already loaded".
            let _ = Command::new("launchctl")
                .args(["bootstrap", &domain, &path.to_string_lossy()])
                .output();
            log::info!("login agent {} installed at {}", agent.label, path.display());
        } else {
            // Not `bootout`: that would stop the running daemon. The job is gone at the next login.
            let _ = Command::new("launchctl").args(["disable", &service]).status();
            if path.exists() {
                std::fs::remove_file(&path).map_err(err)?;
            }
            log::info!("login agent {} removed", agent.label);
        }
        Ok(())
    }
}

// ------------------------------------------------------------------ Linux --

#[cfg(target_os = "linux")]
mod linux {
    use super::*;

    fn config_dir() -> PathBuf {
        std::env::var("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| Path::new(&std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())).join(".config"))
    }

    fn has_systemd() -> bool {
        Command::new("systemctl")
            .args(["--user", "is-system-running"])
            .output()
            .is_ok_and(|o| !o.stdout.is_empty())
    }

    pub fn set(agent: &LoginAgent, on: bool) -> PortResult<()> {
        let exec = std::iter::once(agent.exe.to_string_lossy().into_owned())
            .chain(agent.args.iter().cloned())
            .collect::<Vec<_>>()
            .join(" ");
        if has_systemd() {
            let unit = config_dir().join("systemd/user/alarmd.service");
            if on {
                std::fs::create_dir_all(unit.parent().unwrap_or(Path::new("."))).map_err(err)?;
                std::fs::write(
                    &unit,
                    format!(
                        "[Unit]\nDescription=Alarm daemon\n\n[Service]\nExecStart={exec}\nEnvironment=ALARMD_SYSTEMD=1\n\
                         Restart=on-failure\nRestartSec=1\n\n[Install]\nWantedBy=default.target\n"
                    ),
                )
                .map_err(err)?;
                let _ = Command::new("systemctl").args(["--user", "daemon-reload"]).status();
                let _ = Command::new("systemctl")
                    .args(["--user", "enable", "alarmd.service"])
                    .status();
            } else {
                // `disable` keeps the running instance alive.
                let _ = Command::new("systemctl")
                    .args(["--user", "disable", "alarmd.service"])
                    .status();
            }
        } else {
            let desktop = config_dir().join("autostart/alarmd.desktop");
            if on {
                std::fs::create_dir_all(desktop.parent().unwrap_or(Path::new("."))).map_err(err)?;
                std::fs::write(
                    &desktop,
                    format!("[Desktop Entry]\nType=Application\nName=Alarm\nExec={exec}\nNoDisplay=true\nX-GNOME-Autostart-enabled=true\n"),
                )
                .map_err(err)?;
            } else if desktop.exists() {
                std::fs::remove_file(&desktop).map_err(err)?;
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------- Windows --

#[cfg(windows)]
mod win {
    use super::*;

    pub fn set(agent: &LoginAgent, on: bool) -> PortResult<()> {
        let exe = agent.exe.to_string_lossy().into_owned();
        if on {
            let tr = format!("\"{exe}\" {}", agent.args.join(" "));
            let ok = Command::new("schtasks")
                .args([
                    "/Create",
                    "/F",
                    "/SC",
                    "ONLOGON",
                    "/RL",
                    "LIMITED",
                    "/TN",
                    &agent.label,
                    "/TR",
                    &tr,
                ])
                .status()
                .is_ok_and(|s| s.success());
            if !ok {
                let _ = Command::new("reg")
                    .args([
                        "add",
                        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                        "/v",
                        "Alarm",
                        "/t",
                        "REG_SZ",
                        "/d",
                        &tr,
                        "/f",
                    ])
                    .status();
            }
        } else {
            let _ = Command::new("schtasks")
                .args(["/Delete", "/F", "/TN", &agent.label])
                .status();
            let _ = Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "Alarm",
                    "/f",
                ])
                .status();
        }
        Ok(())
    }
}

impl LoginAgent {
    /// `true` when the daemon runs from a bundle and uses `SMAppService` (macOS).
    pub fn uses_bundle(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            mac::bundle_contents(&self.exe, &self.label).is_some()
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }
}

impl LoginItem for LoginAgent {
    fn set_enabled(&self, on: bool) -> PortResult<()> {
        if !self.enabled {
            return Ok(());
        }
        #[cfg(target_os = "macos")]
        {
            if self.uses_bundle() {
                mac::set_bundle(&self.label, on)
            } else {
                mac::set_plist(self, on)
            }
        }
        #[cfg(target_os = "linux")]
        {
            linux::set(self, on)
        }
        #[cfg(windows)]
        {
            win::set(self, on)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plist_restarts_only_after_a_crash() {
        let p = LoginAgent::plist(
            "x.y",
            &["/a b/alarmd".into(), "--flag".into()],
            Some("Contents/MacOS/alarmd"),
        );
        assert!(p.contains("<key>SuccessfulExit</key>\n        <false/>"));
        assert!(p.contains("<string>/a b/alarmd</string>"));
        assert!(p.contains("<key>BundleProgram</key>"));
        assert!(p.contains("<key>RunAtLoad</key>\n    <true/>"));
    }

    #[test]
    fn disabled_agent_never_touches_the_os() {
        let a = LoginAgent::new("test.label", Path::new("/nonexistent"), vec![], false);
        assert!(a.set_enabled(true).is_ok());
        assert!(!a.start_managed());
    }
}
