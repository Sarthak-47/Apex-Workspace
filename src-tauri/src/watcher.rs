// Workspace file watcher using the `notify` crate.
// Emits `fs-changed` Tauri events (debounced) so the frontend can
// refresh the file tree and trigger incremental re-indexing.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatcherState {
    inner: Mutex<Option<RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }
}

#[derive(Clone, Serialize)]
pub struct FsChange {
    pub kind: String,
    pub paths: Vec<String>,
}

const SKIP: &[&str] = &[
    "node_modules", "target", "dist", "build", ".git",
    "__pycache__", ".next", ".nuxt", "out", "coverage",
];

fn should_skip(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        SKIP.contains(&s.as_ref())
    })
}

/// Start watching `workspace` recursively. Replaces any existing watcher.
#[tauri::command]
pub async fn start_watching(
    app: AppHandle,
    state: State<'_, WatcherState>,
    workspace: String,
) -> Result<(), String> {
    // Simple time-based debounce: collapse bursts of events.
    let last = Mutex::new(Instant::now() - Duration::from_secs(1));

    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };

        // Ignore noise from build/dep dirs.
        let paths: Vec<String> = event
            .paths
            .iter()
            .filter(|p| !should_skip(p))
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        if paths.is_empty() { return; }

        // Debounce: at most one emit per 250ms.
        {
            let mut guard = last.lock().unwrap();
            if guard.elapsed() < Duration::from_millis(250) {
                return;
            }
            *guard = Instant::now();
        }

        let kind = match event.kind {
            EventKind::Create(_) => "create",
            EventKind::Modify(_) => "modify",
            EventKind::Remove(_) => "remove",
            _ => "other",
        };

        let _ = app_handle.emit("fs-changed", FsChange {
            kind: kind.to_string(),
            paths,
        });
    })
    .map_err(|e| format!("watcher init error: {e}"))?;

    watcher
        .watch(Path::new(&workspace), RecursiveMode::Recursive)
        .map_err(|e| format!("watch error: {e}"))?;

    // Keep the watcher alive by storing it in managed state.
    *state.inner.lock().unwrap() = Some(watcher);
    Ok(())
}

/// Stop watching (drops the watcher).
#[tauri::command]
pub async fn stop_watching(state: State<'_, WatcherState>) -> Result<(), String> {
    *state.inner.lock().unwrap() = None;
    Ok(())
}
