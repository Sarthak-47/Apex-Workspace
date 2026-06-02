use serde::{Deserialize, Serialize};
use std::process::Command;

fn run_git(workspace: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("git error: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub staged: String,   // XY first char (staged status)
    pub unstaged: String, // XY second char (unstaged status)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_status(workspace: String) -> Result<Vec<GitFileStatus>, String> {
    let raw = run_git(&workspace, &["status", "--porcelain", "-u"])?;
    let mut files = Vec::new();
    for line in raw.lines() {
        if line.len() < 4 { continue; }
        let staged   = &line[0..1];
        let unstaged = &line[1..2];
        let path     = line[3..].trim().to_string();
        files.push(GitFileStatus {
            path,
            staged:   staged.to_string(),
            unstaged: unstaged.to_string(),
        });
    }
    Ok(files)
}

#[tauri::command]
pub async fn git_diff_file(workspace: String, path: String, staged: bool) -> Result<String, String> {
    if staged {
        run_git(&workspace, &["diff", "--cached", "--", &path])
    } else {
        run_git(&workspace, &["diff", "--", &path])
    }
}

#[tauri::command]
pub async fn git_stage_file(workspace: String, path: String) -> Result<(), String> {
    run_git(&workspace, &["add", "--", &path])?;
    Ok(())
}

#[tauri::command]
pub async fn git_unstage_file(workspace: String, path: String) -> Result<(), String> {
    run_git(&workspace, &["reset", "HEAD", "--", &path])?;
    Ok(())
}

#[tauri::command]
pub async fn git_stage_all(workspace: String) -> Result<(), String> {
    run_git(&workspace, &["add", "-A"])?;
    Ok(())
}

#[tauri::command]
pub async fn git_unstage_all(workspace: String) -> Result<(), String> {
    run_git(&workspace, &["reset", "HEAD"])?;
    Ok(())
}

#[tauri::command]
pub async fn git_commit(workspace: String, message: String) -> Result<(), String> {
    run_git(&workspace, &["commit", "-m", &message])?;
    Ok(())
}

#[tauri::command]
pub async fn git_push(workspace: String) -> Result<String, String> {
    run_git(&workspace, &["push"])
}

#[tauri::command]
pub async fn git_pull(workspace: String) -> Result<String, String> {
    run_git(&workspace, &["pull"])
}

#[tauri::command]
pub async fn git_log(workspace: String) -> Result<Vec<GitCommit>, String> {
    let raw = run_git(
        &workspace,
        &[
            "log",
            "--format=%H%x1f%h%x1f%an%x1f%ar%x1f%s",
            "-n",
            "50",
        ],
    )?;
    let commits = raw
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '\x1f').collect();
            if parts.len() == 5 {
                Some(GitCommit {
                    hash:       parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    author:     parts[2].to_string(),
                    date:       parts[3].to_string(),
                    message:    parts[4].to_string(),
                })
            } else {
                None
            }
        })
        .collect();
    Ok(commits)
}

#[tauri::command]
pub async fn git_current_branch(workspace: String) -> Result<String, String> {
    let out = run_git(&workspace, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(out.trim().to_string())
}

#[tauri::command]
pub async fn git_discard_file(workspace: String, path: String) -> Result<(), String> {
    run_git(&workspace, &["checkout", "--", &path])?;
    Ok(())
}

#[tauri::command]
pub async fn git_file_at_head(workspace: String, path: String) -> Result<String, String> {
    match run_git(&workspace, &["show", &format!("HEAD:{}", path)]) {
        Ok(content) => Ok(content),
        Err(e) => {
            // New files don't exist at HEAD — return empty string so DiffEditor shows full addition
            if e.contains("does not exist") || e.contains("exists on disk")
                || e.contains("unknown revision") || e.contains("fatal: Path")
                || e.contains("pathspec")
            {
                Ok(String::new())
            } else {
                Err(e)
            }
        }
    }
}

#[tauri::command]
pub async fn git_list_branches(workspace: String) -> Result<Vec<String>, String> {
    let raw = run_git(&workspace, &["branch", "--format=%(refname:short)"])?;
    Ok(raw.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

#[tauri::command]
pub async fn git_switch_branch(workspace: String, branch: String) -> Result<(), String> {
    run_git(&workspace, &["checkout", &branch])?;
    Ok(())
}

#[tauri::command]
pub async fn git_create_branch(workspace: String, branch: String) -> Result<(), String> {
    run_git(&workspace, &["checkout", "-b", &branch])?;
    Ok(())
}
