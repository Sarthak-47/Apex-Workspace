mod terminal;
mod git;
mod bash;
mod watcher;
mod gmail;
mod fireflies;
mod secrets;
mod mcp;
mod lsp;
mod hardware;
mod docs;

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

// ─── Structured workspace search (VS Code-style) ─────────────────────────────

#[derive(Serialize)]
pub struct SearchMatch {
    pub line: usize,
    pub text: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Serialize)]
pub struct SearchFileResult {
    pub path: String,
    pub matches: Vec<SearchMatch>,
}

const MAX_TOTAL_MATCHES: usize = 5000;
const MAX_MATCHES_PER_FILE: usize = 500;

fn glob_to_regex(glob: &str) -> Option<regex::Regex> {
    let mut r = String::from("(?i)");
    for ch in glob.chars() {
        match ch {
            '*' => r.push_str(".*"),
            '?' => r.push('.'),
            '/' | '\\' => r.push_str("[\\\\/]"),
            c => r.push_str(&regex::escape(&c.to_string())),
        }
    }
    regex::Regex::new(&r).ok()
}

#[allow(clippy::too_many_arguments)]
#[command]
async fn search_files(
    workspace: String,
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    is_regex: bool,
    includes: Option<String>,
    excludes: Option<String>,
) -> Result<Vec<SearchFileResult>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }
    let mut pat = if is_regex { query.clone() } else { regex::escape(&query) };
    if whole_word {
        pat = format!(r"\b{pat}\b");
    }
    let re = regex::RegexBuilder::new(&pat)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| format!("Invalid pattern: {e}"))?;

    let split = |s: Option<String>| -> Vec<regex::Regex> {
        s.unwrap_or_default()
            .split(',')
            .map(|x| x.trim())
            .filter(|x| !x.is_empty())
            .filter_map(glob_to_regex)
            .collect()
    };
    let inc = split(includes);
    let exc = split(excludes);

    let mut out: Vec<SearchFileResult> = Vec::new();
    let mut total = 0usize;
    search_walk(Path::new(&workspace), &re, &workspace, &inc, &exc, &mut out, &mut total);
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
fn search_walk(
    dir: &Path,
    re: &regex::Regex,
    workspace: &str,
    inc: &[regex::Regex],
    exc: &[regex::Regex],
    out: &mut Vec<SearchFileResult>,
    total: &mut usize,
) {
    if *total >= MAX_TOTAL_MATCHES {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if *total >= MAX_TOTAL_MATCHES {
            return;
        }
        let path = entry.path();
        let name = entry.file_name();
        let name_s = name.to_string_lossy();
        if name_s.starts_with('.') && name_s != ".env" {
            continue;
        }
        if SKIP_DIRS.contains(&name_s.as_ref()) {
            continue;
        }
        if path.is_dir() {
            search_walk(&path, re, workspace, inc, exc, out, total);
        } else {
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !TEXT_EXTS.contains(&ext.as_str()) {
                continue;
            }
            let rel = path
                .strip_prefix(workspace)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            if !inc.is_empty() && !inc.iter().any(|g| g.is_match(&rel)) {
                continue;
            }
            if exc.iter().any(|g| g.is_match(&rel)) {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else { continue };
            let mut matches: Vec<SearchMatch> = Vec::new();
            for (i, line) in content.lines().enumerate() {
                if matches.len() >= MAX_MATCHES_PER_FILE {
                    break;
                }
                for m in re.find_iter(line) {
                    let start = line[..m.start()].chars().count();
                    let end = line[..m.end()].chars().count();
                    let text: String = line.chars().take(400).collect();
                    matches.push(SearchMatch { line: i + 1, text, start, end });
                    *total += 1;
                    if matches.len() >= MAX_MATCHES_PER_FILE || *total >= MAX_TOTAL_MATCHES {
                        break;
                    }
                }
            }
            if !matches.is_empty() {
                out.push(SearchFileResult {
                    path: path.to_string_lossy().replace('\\', "/"),
                    matches,
                });
            }
        }
    }
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
        .manage(lsp::LspRegistry::new())
        .invoke_handler(tauri::generate_handler![
            // File system
            read_file,
            write_file,
            list_dir,
            create_dir,
            delete_path,
            rename_path,
            grep_files,
            search_files,
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
            git::git_blame,
            git::git_apply_cached,
            git::git_stash_save,
            git::git_stash_pop,
            git::git_stash_list,
            git::git_stash_apply,
            git::git_stash_pop_index,
            git::git_stash_drop,
            git::gh_pr_list,
            git::gh_pr_create,
            git::gh_pr_checkout,
            git::gh_available,
            secrets::set_secret,
            secrets::get_secret,
            secrets::delete_secret,
            secrets::has_secret,
            // Bash (approval-gated)
            bash::run_bash,
            bash::kill_bash,
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
            // LSP (language servers)
            lsp::lsp_start,
            lsp::lsp_send,
            lsp::lsp_stop,
            lsp::lsp_running,
            // Hardware (Model Cookbook)
            hardware::hardware_info,
            // Document ingestion
            docs::extract_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running APEX");
}
