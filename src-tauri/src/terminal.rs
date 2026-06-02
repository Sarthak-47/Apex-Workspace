use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

// ─── Session ──────────────────────────────────────────────────────────────────

struct PtySession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
}

// ─── Registry (managed state) ─────────────────────────────────────────────────

pub struct PtyRegistry(Arc<Mutex<HashMap<String, Arc<PtySession>>>>);

impl PtyRegistry {
    pub fn new() -> Self {
        PtyRegistry(Arc::new(Mutex::new(HashMap::new())))
    }
}

// ─── Shell detection ──────────────────────────────────────────────────────────

fn detect_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        for shell in &["pwsh.exe", "powershell.exe", "cmd.exe"] {
            let found = std::process::Command::new("where")
                .arg(shell)
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if found {
                return shell.to_string();
            }
        }
        "cmd.exe".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn gen_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("pty-{ns}")
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_pty(
    app: tauri::AppHandle,
    registry: tauri::State<'_, PtyRegistry>,
    shell: Option<String>,
    cwd: String,
) -> Result<String, String> {
    let pty_id = gen_id();
    let shell_path = shell.unwrap_or_else(detect_shell);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let mut cmd = CommandBuilder::new(&shell_path);
    cmd.cwd(std::path::Path::new(&cwd));

    let _child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn: {e}"))?;
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer: {e}"))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone_reader: {e}"))?;

    let session = Arc::new(PtySession {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
    });

    {
        registry
            .0
            .lock()
            .unwrap()
            .insert(pty_id.clone(), session.clone());
    }

    // Reader thread — pipes PTY output to frontend via Tauri events
    let pty_id_reader = pty_id.clone();
    let registry_ref = Arc::clone(&registry.0);
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(&format!("pty-output-{}", pty_id_reader), data);
                }
            }
        }
        // Emit exit event and clean up session
        let _ = app.emit(&format!("pty-exit-{}", pty_id_reader), ());
        registry_ref.lock().unwrap().remove(&pty_id_reader);
    });

    Ok(pty_id)
}

#[tauri::command]
pub async fn write_pty(
    registry: tauri::State<'_, PtyRegistry>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    // Clone the Arc so we can release the HashMap lock before writing
    let session = {
        registry.0.lock().unwrap().get(&pty_id).cloned()
    };
    if let Some(session) = session {
        session
            .writer
            .lock()
            .unwrap()
            .write_all(data.as_bytes())
            .map_err(|e| format!("write_pty: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn resize_pty(
    registry: tauri::State<'_, PtyRegistry>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = {
        registry.0.lock().unwrap().get(&pty_id).cloned()
    };
    if let Some(session) = session {
        session
            .master
            .lock()
            .unwrap()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("resize_pty: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_pty(
    registry: tauri::State<'_, PtyRegistry>,
    pty_id: String,
) -> Result<(), String> {
    registry.0.lock().unwrap().remove(&pty_id);
    Ok(())
}
