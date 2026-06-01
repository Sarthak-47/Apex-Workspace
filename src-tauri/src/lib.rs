use serde::{Deserialize, Serialize};
use std::fs;
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
    // Ensure parent directory exists
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
    // Sort: dirs first, then files, both alphabetically
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

// ─── App Entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            list_dir,
            create_dir,
            delete_path,
            rename_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running APEX");
}
