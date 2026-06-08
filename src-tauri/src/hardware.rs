// Hardware detection for the Model Cookbook: total RAM, CPU, and a best-effort
// GPU name + VRAM probe (nvidia-smi, then platform fallbacks).

use std::process::Command;
use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Serialize)]
pub struct HardwareInfo {
    pub cpu: String,
    pub cores: usize,
    pub ram_mb: u64,
    pub gpu: Option<String>,
    pub vram_mb: Option<u64>,
}

fn nvidia_smi() -> Option<(String, u64)> {
    let out = Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output().ok()?;
    if !out.status.success() { return None; }
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().next()?;
    let mut parts = line.split(',');
    let name = parts.next()?.trim().to_string();
    let vram = parts.next()?.trim().parse::<u64>().ok()?;
    Some((name, vram))
}

#[cfg(target_os = "windows")]
fn gpu_fallback() -> Option<(String, Option<u64>)> {
    // wmic gives a name; AdapterRAM is unreliable (>4GB wraps), so VRAM stays None.
    let out = Command::new("wmic")
        .args(["path", "win32_VideoController", "get", "Name"])
        .output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let name = text.lines().map(|l| l.trim()).find(|l| !l.is_empty() && *l != "Name")?;
    Some((name.to_string(), None))
}

#[cfg(not(target_os = "windows"))]
fn gpu_fallback() -> Option<(String, Option<u64>)> { None }

#[tauri::command]
pub async fn hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    let cpu = sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default();
    let cores = sys.cpus().len();
    let ram_mb = sys.total_memory() / (1024 * 1024);

    let (gpu, vram_mb) = match nvidia_smi() {
        Some((name, vram)) => (Some(name), Some(vram)),
        None => match gpu_fallback() {
            Some((name, vram)) => (Some(name), vram),
            None => (None, None),
        },
    };

    Ok(HardwareInfo { cpu, cores, ram_mb, gpu, vram_mb })
}
