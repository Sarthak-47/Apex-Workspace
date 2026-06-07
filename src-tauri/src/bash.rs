// Approval-gated bash/shell command execution.
// The frontend handles the Allow Once / Allow Always / Deny gating UI;
// this command only runs once the frontend has approved it.

use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BashResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
}

/// Run a shell command in `cwd` with a timeout (seconds, hard cap 300).
/// Uses the platform shell: cmd.exe on Windows, /bin/sh elsewhere.
#[tauri::command]
pub async fn run_bash(
    command: String,
    cwd: Option<String>,
    timeout: Option<u64>,
) -> Result<BashResult, String> {
    let timeout_secs = timeout.unwrap_or(30).min(300).max(1);

    // Build the platform-appropriate shell invocation.
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", &command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", &command]);
        c
    };

    if let Some(dir) = cwd {
        if !dir.is_empty() {
            cmd.current_dir(dir);
        }
    }

    // Run on a worker thread so we can enforce a timeout via recv_timeout.
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let output = cmd.output();
        let _ = tx.send(output);
    });

    match rx.recv_timeout(Duration::from_secs(timeout_secs)) {
        Ok(Ok(output)) => Ok(BashResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
            timed_out: false,
        }),
        Ok(Err(e)) => Err(format!("Failed to run command: {e}")),
        Err(_) => Ok(BashResult {
            stdout: String::new(),
            stderr: format!("Command timed out after {timeout_secs}s"),
            exit_code: -1,
            timed_out: true,
        }),
    }
}
