// Minimal MCP (Model Context Protocol) client.
// Launches an MCP server as a subprocess and speaks JSON-RPC 2.0 over stdio.
// Supports initialize, tools/list and tools/call. One request/response at a
// time per server (notifications and mismatched ids are skipped).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

struct McpServer {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    next_id: u64,
    tools: Vec<Value>,
}

#[derive(Default)]
pub struct McpRegistry {
    servers: Mutex<HashMap<String, McpServer>>,
}

impl McpRegistry {
    pub fn new() -> Self {
        Self { servers: Mutex::new(HashMap::new()) }
    }
}

#[derive(Serialize)]
pub struct McpStartResult {
    name: String,
    tools: Vec<Value>,
}

impl McpServer {
    /// Send a JSON-RPC request and wait for the matching response.
    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let req = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let line = serde_json::to_string(&req).map_err(|e| e.to_string())? + "\n";
        self.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        self.stdin.flush().map_err(|e| e.to_string())?;

        // Read lines until we get our id (skip notifications / other ids).
        for _ in 0..1000 {
            let mut buf = String::new();
            let n = self.reader.read_line(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 { return Err("MCP server closed the connection".into()); }
            let Ok(msg) = serde_json::from_str::<Value>(buf.trim()) else { continue };
            if msg["id"].as_u64() == Some(id) {
                if let Some(err) = msg.get("error") {
                    return Err(format!("MCP error: {}", err["message"].as_str().unwrap_or("unknown")));
                }
                return Ok(msg["result"].clone());
            }
        }
        Err("No response from MCP server".into())
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        let msg = json!({ "jsonrpc": "2.0", "method": method, "params": params });
        let line = serde_json::to_string(&msg).map_err(|e| e.to_string())? + "\n";
        self.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        self.stdin.flush().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn mcp_start(
    registry: State<'_, McpRegistry>,
    name: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<McpStartResult, String> {
    // Stop an existing server of the same name first.
    {
        let mut servers = registry.servers.lock().unwrap();
        if let Some(mut old) = servers.remove(&name) {
            let _ = old.child.kill();
        }
    }

    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .envs(&env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("failed to launch '{command}': {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let reader = BufReader::new(stdout);

    let mut server = McpServer { child, stdin, reader, next_id: 0, tools: Vec::new() };

    // Initialize handshake
    server.request("initialize", json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": { "name": "apex", "version": "0.1.0" }
    }))?;
    server.notify("notifications/initialized", json!({}))?;

    // List tools
    let tools = server.request("tools/list", json!({}))
        .map(|r| r["tools"].as_array().cloned().unwrap_or_default())
        .unwrap_or_default();
    server.tools = tools.clone();

    registry.servers.lock().unwrap().insert(name.clone(), server);
    Ok(McpStartResult { name, tools })
}

#[tauri::command]
pub async fn mcp_list_tools(registry: State<'_, McpRegistry>, name: String) -> Result<Vec<Value>, String> {
    let mut servers = registry.servers.lock().unwrap();
    let server = servers.get_mut(&name).ok_or("server not running")?;
    let tools = server.request("tools/list", json!({}))
        .map(|r| r["tools"].as_array().cloned().unwrap_or_default())?;
    server.tools = tools.clone();
    Ok(tools)
}

#[tauri::command]
pub async fn mcp_call_tool(
    registry: State<'_, McpRegistry>,
    name: String,
    tool: String,
    arguments: Value,
) -> Result<Value, String> {
    let mut servers = registry.servers.lock().unwrap();
    let server = servers.get_mut(&name).ok_or("server not running")?;
    server.request("tools/call", json!({ "name": tool, "arguments": arguments }))
}

#[tauri::command]
pub async fn mcp_stop(registry: State<'_, McpRegistry>, name: String) -> Result<(), String> {
    let mut servers = registry.servers.lock().unwrap();
    if let Some(mut server) = servers.remove(&name) {
        let _ = server.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_running(registry: State<'_, McpRegistry>) -> Result<Vec<String>, String> {
    Ok(registry.servers.lock().unwrap().keys().cloned().collect())
}
