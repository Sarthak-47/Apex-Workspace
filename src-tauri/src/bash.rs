// Approval-gated bash/shell command execution with a cancellable run registry.
// The frontend handles the Allow Once / Always / Deny gating UI; this command
// only runs once approved. Each run is registered by `run_id` so it can be
// killed mid-flight (the Stop button) or auto-killed on timeout.

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BashResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub timed_out: bool,
    pub killed: bool,
}

// run_id -> OS PID of the running child
static RUNNING: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
fn running() -> &'static Mutex<HashMap<String, u32>> {
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn kill_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
    }
}

/// Run a shell command in `cwd` with a timeout (seconds, hard cap 300).
/// `run_id` (if given) registers the process so it can be killed via `kill_bash`.
#[tauri::command]
pub async fn run_bash(
    command: String,
    cwd: Option<String>,
    timeout: Option<u64>,
    run_id: Option<String>,
) -> Result<BashResult, String> {
    let timeout_secs = timeout.unwrap_or(30).min(300).max(1);

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", &command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", &command]);
        c
    };
    if let Some(dir) = cwd { if !dir.is_empty() { cmd.current_dir(dir); } }
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Failed to run command: {e}"))?;
    let pid = child.id();
    if let Some(id) = &run_id {
        running().lock().unwrap().insert(id.clone(), pid);
    }

    // Wait (with output) on a worker thread so we can enforce a timeout.
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || { let _ = tx.send(child.wait_with_output()); });

    let result = match rx.recv_timeout(Duration::from_secs(timeout_secs)) {
        Ok(Ok(output)) => {
            // Distinguish a normal exit from one we killed.
            let killed = run_id.as_ref().map(|id| !running().lock().unwrap().contains_key(id)).unwrap_or(false);
            Ok(BashResult {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code().unwrap_or(-1),
                timed_out: false,
                killed,
            })
        }
        Ok(Err(e)) => Err(format!("Command error: {e}")),
        Err(_) => {
            kill_pid(pid); // timed out — terminate
            Ok(BashResult { stdout: String::new(), stderr: format!("Command timed out after {timeout_secs}s"), exit_code: -1, timed_out: true, killed: false })
        }
    };

    if let Some(id) = &run_id { running().lock().unwrap().remove(id); }
    result
}

/// Kill a running command by its run_id (the Stop button).
#[tauri::command]
pub async fn kill_bash(run_id: String) -> Result<(), String> {
    let pid = running().lock().unwrap().remove(&run_id);
    if let Some(pid) = pid { kill_pid(pid); }
    Ok(())
}
