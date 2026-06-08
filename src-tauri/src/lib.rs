mod terminal;
mod git;
mod bash;
mod watcher;
mod gmail;
mod fireflies;
mod mcp;
mod hardware;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

// ─── File System Types ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub ext: Option<String>,
}

// ─── File System Commands ────────────────────────────────────────────────────

#[command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read_file error: {e}"))
}

#[command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create_dir error: {e}"))?;
    }
    fs::write(&path, content).map_err(|e| format!("write_file error: {e}"))
}

#[command]
async fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("list_dir error: {e}"))?;
    let mut result = Vec::new();
    for entry in entries.flatten() {
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = entry.path().to_string_lossy().to_string();
        let ext = entry
            .path()
            .extension()
            .map(|e| e.to_string_lossy().to_string());
        result.push(DirEntry {
            name,
            path: full_path,
            is_dir,
            size,
            ext,
        });
    }
    result.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(result)
}

#[command]
async fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("create_dir error: {e}"))
}

#[command]
async fn delete_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("delete_path error: {e}"))
    } else {
        fs::remove_file(p).map_err(|e| format!("delete_path error: {e}"))
    }
}

#[command]
async fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("rename_path error: {e}"))
}

// ─── Grep (agent tool) ───────────────────────────────────────────────────────

const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", "dist", "build", ".git",
    "__pycache__", ".next", ".nuxt", "out", "coverage",
];

const TEXT_EXTS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "rb",
    "c", "cpp", "h", "hpp", "cs", "swift", "kt", "json", "md",
    "toml", "yaml", "yml", "css", "scss", "html", "txt", "sh",
    "bash", "zsh", "fish", "env", "gitignore", "lock", "xml",
];

fn grep_walk(dir: &Path, pattern: &str, workspace: &str, results: &mut Vec<String>) {
    if results.len() >= 100 { return; }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if results.len() >= 100 { return; }
        let path = entry.path();
        let name = entry.file_name();
        let name_s = name.to_string_lossy();
        if name_s.starts_with('.') && name_s != ".env" { continue; }
        if SKIP_DIRS.contains(&name_s.as_ref()) { continue; }
        if path.is_dir() {
            grep_walk(&path, pattern, workspace, results);
        } else {
            let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !TEXT_EXTS.contains(&ext.as_str()) { continue; }
            let Ok(content) = fs::read_to_string(&path) else { continue };
            let rel = path.strip_prefix(workspace).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(pattern) {
                    results.push(format!("{}:{}:{}", rel, i + 1, line.trim()));
                    if results.len() >= 100 { return; }
                }
            }
        }
    }
}

#[command]
async fn grep_files(workspace: String, pattern: String, dir: Option<String>) -> Result<Vec<String>, String> {
    let search_dir = dir
        .map(|d| Path::new(&workspace).join(d).to_string_lossy().to_string())
        .unwrap_or_else(|| workspace.clone());
    let pattern_lower = pattern.to_lowercase();
    let mut results = Vec::new();
    grep_walk(Path::new(&search_dir), &pattern_lower, &workspace, &mut results);
    Ok(results)
}

// ─── App Entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(terminal::PtyRegistry::new())
        .manage(watcher::WatcherState::new())
        .manage(mcp::McpRegistry::new())
        .invoke_handler(tauri::generate_handler![
            // File system
            read_file,
            write_file,
            list_dir,
            create_dir,
            delete_path,
            rename_path,
            grep_files,
            // Terminal (PTY)
            terminal::create_pty,
            terminal::write_pty,
            terminal::resize_pty,
            terminal::close_pty,
            // Git
            git::git_status,
            git::git_diff_file,
            git::git_file_at_head,
            git::git_stage_file,
            git::git_unstage_file,
            git::git_stage_all,
            git::git_unstage_all,
            git::git_commit,
            git::git_push,
            git::git_pull,
            git::git_log,
            git::git_current_branch,
            git::git_discard_file,
            git::git_list_branches,
            git::git_switch_branch,
            git::git_create_branch,
            // Bash (approval-gated)
            bash::run_bash,
            // File watcher
            watcher::start_watching,
            watcher::stop_watching,
            // Gmail
            gmail::gmail_status,
            gmail::gmail_start_auth,
            gmail::gmail_sync,
            gmail::gmail_disconnect,
            // Calendar (shares Google OAuth)
            gmail::calendar_status,
            gmail::calendar_sync,
            // Fireflies
            fireflies::fireflies_status,
            fireflies::fireflies_set_key,
            fireflies::fireflies_sync,
            fireflies::fireflies_disconnect,
            // MCP
            mcp::mcp_start,
            mcp::mcp_list_tools,
            mcp::mcp_call_tool,
            mcp::mcp_stop,
            mcp::mcp_running,
            // Hardware (Model Cookbook)
            hardware::hardware_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running APEX");
}
