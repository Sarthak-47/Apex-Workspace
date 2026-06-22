// Generic secret store backed by the OS keyring. Used for things like the
// optional cloud-model API key so secrets never touch disk in plaintext.

const KEYRING_SERVICE: &str = "apex-workspace";

fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_secret(name: String, value: String) -> Result<(), String> {
    entry(&name)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_secret(name: String) -> Result<Option<String>, String> {
    match keyring::Entry::new(KEYRING_SERVICE, &name) {
        Ok(e) => Ok(e.get_password().ok()),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn delete_secret(name: String) -> Result<(), String> {
    if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, &name) {
        let _ = e.delete_credential();
    }
    Ok(())
}

#[tauri::command]
pub async fn has_secret(name: String) -> Result<bool, String> {
    Ok(keyring::Entry::new(KEYRING_SERVICE, &name)
        .ok()
        .and_then(|e| e.get_password().ok())
        .is_some())
}
