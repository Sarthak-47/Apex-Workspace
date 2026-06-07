// Fireflies.ai meeting-transcript sync (GraphQL API, Bearer token).
// Transcripts are written as Markdown under <workspace>/.apex/vault/meetings/.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const KEYRING_SERVICE: &str = "apex-workspace";
const KEYRING_USER: &str = "fireflies-key";
const GRAPHQL_ENDPOINT: &str = "https://api.fireflies.ai/graphql";

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn load_key() -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?.get_password().ok()
}

#[tauri::command]
pub async fn fireflies_set_key(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fireflies_disconnect() -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct FfState {
    last_synced: u64,
    meeting_count: u64,
}

#[derive(Debug, Serialize)]
pub struct FfStatus {
    connected: bool,
    last_synced: Option<u64>,
    meeting_count: Option<u64>,
}

fn state_path(workspace: &str) -> std::path::PathBuf {
    Path::new(workspace).join(".apex").join("vault").join(".state").join("fireflies_state.json")
}

fn load_state(workspace: &str) -> FfState {
    fs::read_to_string(state_path(workspace)).ok()
        .and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

#[tauri::command]
pub async fn fireflies_status(workspace: Option<String>) -> Result<FfStatus, String> {
    let connected = load_key().is_some();
    let state = workspace.as_deref().map(load_state);
    Ok(FfStatus {
        connected,
        last_synced: state.as_ref().map(|s| s.last_synced).filter(|&t| t > 0),
        meeting_count: state.map(|s| s.meeting_count),
    })
}

#[derive(Debug, Serialize)]
pub struct FfSyncResult {
    meeting_count: u64,
}

#[tauri::command]
pub async fn fireflies_sync(workspace: String) -> Result<FfSyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || sync_blocking(&workspace))
        .await.map_err(|e| e.to_string())?
}

fn slugify(s: &str) -> String {
    s.chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect::<String>()
        .split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-").to_lowercase()
}

fn sync_blocking(workspace: &str) -> Result<FfSyncResult, String> {
    let key = load_key().ok_or("Fireflies not connected")?;
    let client = reqwest::blocking::Client::new();

    let query = json!({
        "query": "query { transcripts(limit: 50) { id title date duration participants summary { overview action_items keywords } sentences { speaker_name text } } }"
    });
    let resp = client.post(GRAPHQL_ENDPOINT)
        .bearer_auth(&key)
        .json(&query)
        .send().map_err(|e| e.to_string())?;
    let json: Value = resp.json().map_err(|e| e.to_string())?;
    if let Some(errors) = json["errors"].as_array() {
        if !errors.is_empty() {
            return Err(format!("Fireflies API error: {}", errors[0]["message"].as_str().unwrap_or("unknown")));
        }
    }
    let empty = vec![];
    let transcripts = json["data"]["transcripts"].as_array().unwrap_or(&empty);

    let dir = Path::new(workspace).join(".apex").join("vault").join("meetings");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut written = 0u64;
    for t in transcripts {
        let (md, date, title) = transcript_to_markdown(t);
        if title.is_empty() { continue; }
        fs::write(dir.join(format!("{}-{}.md", date, slugify(&title))), md).map_err(|e| e.to_string())?;
        written += 1;
    }

    let state = FfState { last_synced: now_secs(), meeting_count: written };
    if let Some(parent) = state_path(workspace).parent() { fs::create_dir_all(parent).ok(); }
    fs::write(state_path(workspace), serde_json::to_string_pretty(&state).unwrap_or_default()).map_err(|e| e.to_string())?;

    Ok(FfSyncResult { meeting_count: written })
}

fn epoch_ms_to_date(ms: f64) -> String {
    use chrono::DateTime;
    DateTime::from_timestamp_millis(ms as i64)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "0000-00-00".into())
}

/// Returns (markdown, date YYYY-MM-DD, title).
fn transcript_to_markdown(t: &Value) -> (String, String, String) {
    let title = t["title"].as_str().unwrap_or("").to_string();
    let date = match &t["date"] {
        Value::Number(n) => epoch_ms_to_date(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => s.get(0..10).unwrap_or("0000-00-00").to_string(),
        _ => "0000-00-00".to_string(),
    };
    let duration = t["duration"].as_f64().map(|d| format!("{:.0} min", d)).unwrap_or_default();

    let empty = vec![];
    let participants: Vec<String> = t["participants"].as_array().unwrap_or(&empty)
        .iter().filter_map(|p| p.as_str().map(|s| s.to_string())).collect();

    let overview = t["summary"]["overview"].as_str().unwrap_or("");
    let action_items = t["summary"]["action_items"].as_str().unwrap_or("");
    let keywords: Vec<String> = t["summary"]["keywords"].as_array().unwrap_or(&empty)
        .iter().filter_map(|k| k.as_str().map(|s| s.to_string())).collect();

    let mut transcript = String::new();
    if let Some(sentences) = t["sentences"].as_array() {
        for s in sentences {
            let speaker = s["speaker_name"].as_str().unwrap_or("Speaker");
            let text = s["text"].as_str().unwrap_or("");
            transcript.push_str(&format!("**{}:** {}\n\n", speaker, text));
        }
    }

    let attendee_links: Vec<String> = participants.iter().map(|p| format!("[[{}]]", p)).collect();

    let md = format!(
        "---\nsource: fireflies\ntitle: {}\ndate: {}\nduration: {}\nparticipants: {}\n---\n\n# {}\n\n## Summary\n{}\n\n## Action Items\n{}\n\n## Key Topics\n{}\n\n## Attendees\n{}\n\n## Transcript\n```\n{}```\n",
        title.replace('\n', " "), date, duration,
        participants.join(", ").replace('\n', " "),
        if title.is_empty() { "(untitled meeting)" } else { &title },
        if overview.is_empty() { "—" } else { overview },
        if action_items.is_empty() { "—" } else { action_items },
        if keywords.is_empty() { "—".to_string() } else { keywords.join(", ") },
        if attendee_links.is_empty() { "(none)".to_string() } else { attendee_links.join(", ") },
        transcript,
    );
    (md, date, title)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn transcript_markdown() {
        let t = json!({
            "title": "Sprint Planning",
            "date": "2026-06-01T10:00:00Z",
            "duration": 45.0,
            "participants": ["Alex Chen", "Bob Smith"],
            "summary": { "overview": "Planned the sprint", "action_items": "Ship auth", "keywords": ["sprint", "auth"] },
            "sentences": [{ "speaker_name": "Alex", "text": "Let's start." }]
        });
        let (md, date, title) = transcript_to_markdown(&t);
        assert_eq!(date, "2026-06-01");
        assert_eq!(title, "Sprint Planning");
        assert!(md.contains("source: fireflies"));
        assert!(md.contains("[[Alex Chen]]"));
        assert!(md.contains("**Alex:** Let's start."));
    }
}
