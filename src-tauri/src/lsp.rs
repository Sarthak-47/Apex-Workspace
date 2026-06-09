// Language Server Protocol transport.
//
// Unlike MCP (line-delimited, synchronous), LSP uses Content-Length framed
// messages and is fully asynchronous (the server pushes diagnostics, progress,
// etc. unsolicited). So Rust acts as a dumb pipe: it spawns the language server,
// forwards every framed message it emits to the frontend as a Tauri event
// (`lsp-message-<id>`), and writes frontend messages back, framed. All JSON-RPC
// correlation and Monaco bridging lives in the frontend (src/lib/lsp.ts).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use tauri::{AppHandle, Emitter, State};

struct LspProc {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
pub struct LspRegistry {
    procs: Mutex<HashMap<String, LspProc>>,
}

impl LspRegistry {
    pub fn new() -> Self {
        Self { procs: Mutex::new(HashMap::new()) }
    }
}

/// Continuously read Content-Length framed messages and forward them to the UI.
fn reader_loop(app: AppHandle, id: String, stdout: ChildStdout) {
    let mut reader = BufReader::new(stdout);
    let event = format!("lsp-message-{id}");
    loop {
        // Parse headers (each terminated by \r\n; a blank line ends the block).
        let mut content_length: usize = 0;
        loop {
            let mut header = String::new();
            match reader.read_line(&mut header) {
                Ok(0) => return, // EOF — server exited
                Ok(_) => {}
                Err(_) => return,
            }
            let trimmed = header.trim_end();
            if trimmed.is_empty() {
                break; // end of headers
            }
            if let Some(v) = trimmed.strip_prefix("Content-Length:") {
                content_length = v.trim().parse().unwrap_or(0);
            }
        }
        if content_length == 0 {
            continue;
        }
        let mut buf = vec![0u8; content_length];
        if reader.read_exact(&mut buf).is_err() {
            return;
        }
        let payload = String::from_utf8_lossy(&buf).to_string();
        let _ = app.emit(&event, payload);
    }
}

/// Spawn a language server. `id` namespaces its event stream and registry slot.
#[tauri::command]
pub async fn lsp_start(
    app: AppHandle,
    registry: State<'_, LspRegistry>,
    id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    // Replace any existing server with the same id.
    {
        let mut procs = registry.procs.lock().unwrap();
        if let Some(mut old) = procs.remove(&id) {
            let _ = old.child.kill();
        }
    }

    // On Windows, npm shims are .cmd/.bat scripts that CreateProcess can't run
    // directly — wrap them with `cmd /c`. Native exes and POSIX run as-is.
    let lower = command.to_lowercase();
    let mut cmd = if cfg!(target_os = "windows") && (lower.ends_with(".cmd") || lower.ends_with(".bat")) {
        let mut c = Command::new("cmd");
        c.arg("/c").arg(&command).args(&args);
        c
    } else {
        let mut c = Command::new(&command);
        c.args(&args);
        c
    };
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if !cwd.is_empty() {
        cmd.current_dir(&cwd);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to launch language server '{command}': {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;

    let app2 = app.clone();
    let id2 = id.clone();
    thread::spawn(move || reader_loop(app2, id2, stdout));

    registry.procs.lock().unwrap().insert(id, LspProc { child, stdin });
    Ok(())
}

/// Send a raw JSON-RPC message string to the server (framing is added here).
#[tauri::command]
pub async fn lsp_send(
    registry: State<'_, LspRegistry>,
    id: String,
    message: String,
) -> Result<(), String> {
    let mut procs = registry.procs.lock().unwrap();
    let proc = procs.get_mut(&id).ok_or("language server not running")?;
    let framed = format!("Content-Length: {}\r\n\r\n{}", message.len(), message);
    proc.stdin.write_all(framed.as_bytes()).map_err(|e| e.to_string())?;
    proc.stdin.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lsp_stop(registry: State<'_, LspRegistry>, id: String) -> Result<(), String> {
    let mut procs = registry.procs.lock().unwrap();
    if let Some(mut p) = procs.remove(&id) {
        let _ = p.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn lsp_running(registry: State<'_, LspRegistry>) -> Result<Vec<String>, String> {
    Ok(registry.procs.lock().unwrap().keys().cloned().collect())
}
