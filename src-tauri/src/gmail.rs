// Gmail OAuth 2.0 (authorization-code flow) + raw thread sync to the vault.
// Tokens live in the OS keychain. Threads are written as Markdown under
// <workspace>/.apex/vault/raw/gmail/. Change detection uses SHA-256 per thread.

use std::fs;
use std::io::Read;
use std::path::Path;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

const KEYRING_SERVICE: &str = "apex-workspace";
const KEYRING_USER: &str = "gmail-credentials";
const SCOPE: &str = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly";
const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";

// ─── Stored credentials ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Credentials {
    client_id: String,
    client_secret: String,
    access_token: String,
    refresh_token: String,
    expires_at: u64, // unix seconds
    email: String,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn load_creds() -> Option<Credentials> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()?;
    let raw = entry.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_creds(creds: &Credentials) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    entry.set_password(&raw).map_err(|e| e.to_string())
}

fn clear_creds() {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        let _ = entry.delete_credential();
    }
}

// ─── Status ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct GmailStatus {
    connected: bool,
    email: Option<String>,
    last_synced: Option<u64>,
    thread_count: Option<u64>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SyncState {
    last_synced: u64,
    thread_count: u64,
    hashes: std::collections::HashMap<String, String>,
}

fn state_path(workspace: &str) -> std::path::PathBuf {
    Path::new(workspace).join(".apex").join("vault").join(".state").join("gmail_state.json")
}

fn load_state(workspace: &str) -> SyncState {
    fs::read_to_string(state_path(workspace))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_state(workspace: &str, state: &SyncState) -> Result<(), String> {
    let p = state_path(workspace);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, serde_json::to_string_pretty(state).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gmail_status(workspace: Option<String>) -> Result<GmailStatus, String> {
    let creds = load_creds();
    let state = workspace.as_deref().map(load_state);
    Ok(GmailStatus {
        connected: creds.is_some(),
        email: creds.map(|c| c.email),
        last_synced: state.as_ref().map(|s| s.last_synced).filter(|&t| t > 0),
        thread_count: state.map(|s| s.thread_count),
    })
}

#[tauri::command]
pub async fn gmail_disconnect() -> Result<(), String> {
    clear_creds();
    Ok(())
}

// ─── OAuth flow ──────────────────────────────────────────────────────────────

/// Starts a localhost redirect server and returns the Google consent URL.
/// The caller (frontend) opens the URL; when the user approves, the server
/// thread exchanges the code for tokens and emits `gmail-connected`.
#[tauri::command]
pub async fn gmail_start_auth(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("no port")?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let auth_url = format!(
        "{AUTH_ENDPOINT}?response_type=code&client_id={}&redirect_uri={}&scope={}&access_type=offline&prompt=consent",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(SCOPE),
    );

    // Background thread: wait for the OAuth callback, exchange the code.
    thread::spawn(move || {
        if let Ok(request) = server.recv() {
            let url = request.url().to_string();
            let code = url.split('?').nth(1).and_then(|q| {
                q.split('&').find_map(|kv| kv.strip_prefix("code=").map(|c| c.to_string()))
            });

            let body = "<html><body style=\"font-family:system-ui;background:#0A0A0F;color:#E2E2EC;text-align:center;padding-top:80px\"><h2>APEX connected to Gmail</h2><p>You can close this tab and return to the app.</p></body></html>";
            let response = tiny_http::Response::from_string(body)
                .with_header("Content-Type: text/html".parse::<tiny_http::Header>().unwrap());
            let _ = request.respond(response);

            if let Some(code) = code {
                match exchange_code(&client_id, &client_secret, &code, &redirect_uri) {
                    Ok(creds) => {
                        let _ = save_creds(&creds);
                        let _ = app.emit("gmail-connected", creds.email.clone());
                    }
                    Err(e) => {
                        let _ = app.emit("gmail-auth-error", e);
                    }
                }
            } else {
                let _ = app.emit("gmail-auth-error", "No authorization code returned".to_string());
            }
        }
    });

    Ok(auth_url)
}

fn exchange_code(client_id: &str, client_secret: &str, code: &str, redirect_uri: &str) -> Result<Credentials, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client.post(TOKEN_ENDPOINT)
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send().map_err(|e| e.to_string())?;
    let json: Value = resp.json().map_err(|e| e.to_string())?;
    let access_token = json["access_token"].as_str().ok_or("no access_token")?.to_string();
    let refresh_token = json["refresh_token"].as_str().unwrap_or("").to_string();
    let expires_in = json["expires_in"].as_u64().unwrap_or(3600);

    let email = fetch_email(&client, &access_token).unwrap_or_default();

    Ok(Credentials {
        client_id: client_id.to_string(),
        client_secret: client_secret.to_string(),
        access_token,
        refresh_token,
        expires_at: now_secs() + expires_in,
        email,
    })
}

fn fetch_email(client: &reqwest::blocking::Client, access_token: &str) -> Option<String> {
    let resp = client.get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
        .bearer_auth(access_token)
        .send().ok()?;
    let json: Value = resp.json().ok()?;
    json["emailAddress"].as_str().map(|s| s.to_string())
}

fn ensure_fresh(creds: &mut Credentials, client: &reqwest::blocking::Client) -> Result<(), String> {
    if now_secs() < creds.expires_at.saturating_sub(60) {
        return Ok(()); // still valid
    }
    if creds.refresh_token.is_empty() {
        return Err("Session expired and no refresh token — reconnect Gmail".into());
    }
    let resp = client.post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", creds.client_id.as_str()),
            ("client_secret", creds.client_secret.as_str()),
            ("refresh_token", creds.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send().map_err(|e| e.to_string())?;
    let json: Value = resp.json().map_err(|e| e.to_string())?;
    creds.access_token = json["access_token"].as_str().ok_or("refresh failed")?.to_string();
    creds.expires_at = now_secs() + json["expires_in"].as_u64().unwrap_or(3600);
    save_creds(creds)?;
    Ok(())
}

// ─── Sync ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SyncResult {
    thread_count: u64,
    new_or_changed: u64,
}

#[tauri::command]
pub async fn gmail_sync(workspace: String, days: u32) -> Result<SyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || sync_blocking(&workspace, days))
        .await
        .map_err(|e| e.to_string())?
}

fn sync_blocking(workspace: &str, days: u32) -> Result<SyncResult, String> {
    let mut creds = load_creds().ok_or("Gmail not connected")?;
    let client = reqwest::blocking::Client::new();
    ensure_fresh(&mut creds, &client)?;

    let query = if days == 0 { String::new() } else { format!("newer_than:{days}d") };
    let thread_ids = list_thread_ids(&client, &creds.access_token, &query)?;

    let mut state = load_state(workspace);
    let dir = Path::new(workspace).join(".apex").join("vault").join("raw").join("gmail");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut changed = 0u64;
    for id in &thread_ids {
        let thread = fetch_thread(&client, &creds.access_token, id)?;
        let md = thread_to_markdown(&thread, id);
        let hash = sha256_hex(&md);
        if state.hashes.get(id) == Some(&hash) {
            continue; // unchanged
        }
        fs::write(dir.join(format!("thread-{id}.md")), &md).map_err(|e| e.to_string())?;
        state.hashes.insert(id.clone(), hash);
        changed += 1;
    }

    state.last_synced = now_secs();
    state.thread_count = thread_ids.len() as u64;
    save_state(workspace, &state)?;

    Ok(SyncResult { thread_count: thread_ids.len() as u64, new_or_changed: changed })
}

fn list_thread_ids(client: &reqwest::blocking::Client, token: &str, query: &str) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut url = format!("https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=100");
        if !query.is_empty() {
            url.push_str(&format!("&q={}", urlencoding::encode(query)));
        }
        if let Some(pt) = &page_token {
            url.push_str(&format!("&pageToken={pt}"));
        }
        let resp = client.get(&url).bearer_auth(token).send().map_err(|e| e.to_string())?;
        let json: Value = resp.json().map_err(|e| e.to_string())?;
        if let Some(arr) = json["threads"].as_array() {
            for t in arr {
                if let Some(id) = t["id"].as_str() {
                    ids.push(id.to_string());
                }
            }
        }
        match json["nextPageToken"].as_str() {
            Some(pt) if ids.len() < 500 => page_token = Some(pt.to_string()),
            _ => break,
        }
    }
    Ok(ids)
}

fn fetch_thread(client: &reqwest::blocking::Client, token: &str, id: &str) -> Result<Value, String> {
    let url = format!("https://gmail.googleapis.com/gmail/v1/users/me/threads/{id}?format=full");
    let resp = client.get(&url).bearer_auth(token).send().map_err(|e| e.to_string())?;
    resp.json().map_err(|e| e.to_string())
}

// ─── Thread → Markdown (pure, unit-tested) ───────────────────────────────────

fn header<'a>(headers: &'a Value, name: &str) -> &'a str {
    headers.as_array()
        .and_then(|arr| arr.iter().find(|h| h["name"].as_str().map(|n| n.eq_ignore_ascii_case(name)).unwrap_or(false)))
        .and_then(|h| h["value"].as_str())
        .unwrap_or("")
}

fn decode_b64url(data: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(data.trim_end_matches('='))
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .unwrap_or_default()
}

/// Recursively find the first text/plain (fallback text/html) body in a payload.
fn extract_body(payload: &Value) -> String {
    let mime = payload["mimeType"].as_str().unwrap_or("");
    if mime == "text/plain" {
        if let Some(data) = payload["body"]["data"].as_str() {
            return decode_b64url(data);
        }
    }
    if let Some(parts) = payload["parts"].as_array() {
        // prefer text/plain
        for p in parts {
            if p["mimeType"].as_str() == Some("text/plain") {
                if let Some(data) = p["body"]["data"].as_str() {
                    return decode_b64url(data);
                }
            }
        }
        // recurse / fall back to html
        for p in parts {
            let b = extract_body(p);
            if !b.is_empty() { return b; }
        }
    }
    if mime == "text/html" {
        if let Some(data) = payload["body"]["data"].as_str() {
            return strip_html(&decode_b64url(data));
        }
    }
    String::new()
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<")
        .replace("&gt;", ">").replace("&#39;", "'").replace("&quot;", "\"")
        .lines().map(|l| l.trim_end()).collect::<Vec<_>>().join("\n")
        .replace("\n\n\n", "\n\n")
}

fn thread_to_markdown(thread: &Value, thread_id: &str) -> String {
    let empty: Vec<Value> = vec![];
    let messages = thread["messages"].as_array().unwrap_or(&empty);

    let mut subject = String::new();
    let mut participants: Vec<String> = Vec::new();
    let mut first_date = String::new();
    let mut last_date = String::new();
    let mut labels: Vec<String> = Vec::new();

    let mut body_sections = String::new();
    for (i, msg) in messages.iter().enumerate() {
        let headers = &msg["payload"]["headers"];
        let from = header(headers, "From");
        let date = header(headers, "Date");
        let subj = header(headers, "Subject");
        if i == 0 { subject = subj.to_string(); first_date = date.to_string(); }
        last_date = date.to_string();
        if !from.is_empty() && !participants.iter().any(|p| p == from) {
            participants.push(from.to_string());
        }
        if let Some(ids) = msg["labelIds"].as_array() {
            for l in ids {
                if let Some(s) = l.as_str() {
                    if !labels.iter().any(|x| x == s) { labels.push(s.to_string()); }
                }
            }
        }
        let body = extract_body(&msg["payload"]);
        body_sections.push_str(&format!("## Email {} — From: {}\n\n*{}*\n\n{}\n\n", i + 1, from, date, body.trim()));
    }

    format!(
        "---\nthread_id: {}\nsubject: {}\nparticipants: {}\ndate_range: {} — {}\nlabels: {}\n---\n\n# {}\n\n{}",
        thread_id,
        subject.replace('\n', " "),
        participants.join(", ").replace('\n', " "),
        first_date, last_date,
        labels.join(", "),
        if subject.is_empty() { "(no subject)" } else { subject.as_str() },
        body_sections.trim_end(),
    )
}

fn sha256_hex(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

// ─── Google Calendar (shares the Gmail OAuth credentials) ────────────────────

#[derive(Debug, Default, Serialize, Deserialize)]
struct CalState {
    last_synced: u64,
    event_count: u64,
}

fn cal_state_path(workspace: &str) -> std::path::PathBuf {
    Path::new(workspace).join(".apex").join("vault").join(".state").join("calendar_state.json")
}

fn load_cal_state(workspace: &str) -> CalState {
    fs::read_to_string(cal_state_path(workspace)).ok()
        .and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

#[tauri::command]
pub async fn calendar_status(workspace: Option<String>) -> Result<GmailStatus, String> {
    let creds = load_creds();
    let state = workspace.as_deref().map(load_cal_state);
    Ok(GmailStatus {
        connected: creds.is_some(),
        email: creds.map(|c| c.email),
        last_synced: state.as_ref().map(|s| s.last_synced).filter(|&t| t > 0),
        thread_count: state.map(|s| s.event_count),
    })
}

#[tauri::command]
pub async fn calendar_sync(workspace: String) -> Result<SyncResult, String> {
    tauri::async_runtime::spawn_blocking(move || calendar_sync_blocking(&workspace))
        .await.map_err(|e| e.to_string())?
}

fn slugify(s: &str) -> String {
    s.chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect::<String>()
        .split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-").to_lowercase()
}

fn calendar_sync_blocking(workspace: &str) -> Result<SyncResult, String> {
    use chrono::{Duration, Utc};
    let mut creds = load_creds().ok_or("Google account not connected")?;
    let client = reqwest::blocking::Client::new();
    ensure_fresh(&mut creds, &client)?;

    let time_min = (Utc::now() - Duration::days(60)).to_rfc3339();
    let time_max = (Utc::now() + Duration::days(14)).to_rfc3339();
    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime&maxResults=250",
        urlencoding::encode(&time_min), urlencoding::encode(&time_max),
    );
    let resp = client.get(&url).bearer_auth(&creds.access_token).send().map_err(|e| e.to_string())?;
    let json: Value = resp.json().map_err(|e| e.to_string())?;
    let empty = vec![];
    let events = json["items"].as_array().unwrap_or(&empty);

    let dir = Path::new(workspace).join(".apex").join("vault").join("raw").join("calendar");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut written = 0u64;
    for ev in events {
        let (md, date, title) = event_to_markdown(ev);
        if title.is_empty() { continue; }
        let fname = format!("{}-{}.md", date, slugify(&title));
        fs::write(dir.join(fname), md).map_err(|e| e.to_string())?;
        written += 1;
    }

    let state = CalState { last_synced: now_secs(), event_count: written };
    if let Some(parent) = cal_state_path(workspace).parent() { fs::create_dir_all(parent).ok(); }
    fs::write(cal_state_path(workspace), serde_json::to_string_pretty(&state).unwrap_or_default()).map_err(|e| e.to_string())?;

    Ok(SyncResult { thread_count: written, new_or_changed: written })
}

/// Returns (markdown, date YYYY-MM-DD, title).
fn event_to_markdown(ev: &Value) -> (String, String, String) {
    let title = ev["summary"].as_str().unwrap_or("").to_string();
    let start = ev["start"]["dateTime"].as_str().or(ev["start"]["date"].as_str()).unwrap_or("");
    let end = ev["end"]["dateTime"].as_str().or(ev["end"]["date"].as_str()).unwrap_or("");
    let date = start.get(0..10).unwrap_or("0000-00-00").to_string();
    let time = start.get(11..16).unwrap_or("").to_string();
    let location = ev["location"].as_str().unwrap_or("");
    let description = ev["description"].as_str().unwrap_or("");
    let calendar = ev["organizer"]["email"].as_str().unwrap_or("primary");

    let empty = vec![];
    let attendees = ev["attendees"].as_array().unwrap_or(&empty);
    let mut names: Vec<String> = Vec::new();
    let mut links: Vec<String> = Vec::new();
    for a in attendees {
        let name = a["displayName"].as_str().or(a["email"].as_str()).unwrap_or("").to_string();
        if name.is_empty() { continue; }
        names.push(name.clone());
        links.push(format!("- [[{}]]", name));
    }

    let md = format!(
        "---\ntitle: {}\ndate: {}\ntime: {}\nduration: {} — {}\nattendees: {}\nlocation: {}\ncalendar: {}\n---\n\n# {}\n\n{}\n\n## Attendees\n{}\n",
        title.replace('\n', " "),
        date, time, start, end,
        names.join(", ").replace('\n', " "),
        location, calendar,
        if title.is_empty() { "(untitled event)" } else { &title },
        description.trim(),
        if links.is_empty() { "(none)".to_string() } else { links.join("\n") },
    );
    (md, date, title)
}

// keep `Read` import used (tiny_http request bodies are not read here, but the
// trait is needed for some platforms' io). Suppress unused on platforms.
#[allow(dead_code)]
fn _io_marker<R: Read>(_r: R) {}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn strips_html() {
        assert_eq!(strip_html("<p>Hello <b>world</b></p>"), "Hello world");
        assert_eq!(strip_html("a&nbsp;&amp;&nbsp;b"), "a & b");
    }

    #[test]
    fn decodes_b64url() {
        // "Hello" in base64url
        assert_eq!(decode_b64url("SGVsbG8"), "Hello");
    }

    #[test]
    fn thread_markdown_has_frontmatter() {
        let thread = json!({
            "messages": [{
                "labelIds": ["INBOX", "IMPORTANT"],
                "payload": {
                    "mimeType": "text/plain",
                    "headers": [
                        {"name": "From", "value": "Alex <alex@x.com>"},
                        {"name": "Subject", "value": "Auth decision"},
                        {"name": "Date", "value": "Mon, 1 Jun 2026"}
                    ],
                    "body": {"data": "SGVsbG8"}
                }
            }]
        });
        let md = thread_to_markdown(&thread, "t123");
        assert!(md.contains("thread_id: t123"));
        assert!(md.contains("subject: Auth decision"));
        assert!(md.contains("## Email 1 — From: Alex <alex@x.com>"));
        assert!(md.contains("Hello"));
    }
}
