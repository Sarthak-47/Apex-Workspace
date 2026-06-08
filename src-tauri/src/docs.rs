// Document text extraction (Odysseus B4): PDF / DOCX / PPTX / XLSX / EPUB / text
// -> plain text, so documents can be ingested into the codebase index.

use std::io::Read;
use std::path::Path;

/// Extract the text content of a document for indexing. Best-effort.
#[tauri::command]
pub async fn extract_document(path: String) -> Result<String, String> {
    let ext = Path::new(&path)
        .extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();

    let text = match ext.as_str() {
        "pdf" => pdf_extract::extract_text(&path).map_err(|e| format!("PDF extract error: {e}"))?,
        "docx" => extract_office_xml(&path, &["word/document.xml"])?,
        "pptx" => extract_office_glob(&path, "ppt/slides/slide")?,
        "xlsx" => extract_office_xml(&path, &["xl/sharedStrings.xml"])?,
        "epub" => extract_office_glob(&path, "")?, // pull text from all xhtml/html entries
        "md" | "txt" | "csv" | "json" | "html" | "rtf" => {
            std::fs::read_to_string(&path).map_err(|e| format!("read error: {e}"))?
        }
        _ => return Err(format!("Unsupported document type: .{ext}")),
    };

    // collapse excessive whitespace
    let cleaned = text.lines().map(|l| l.trim_end()).collect::<Vec<_>>().join("\n");
    Ok(cleaned.replace("\n\n\n", "\n\n"))
}

/// Read specific XML entries from an Office zip and strip tags.
fn extract_office_xml(path: &str, entries: &[&str]) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("not a valid Office file: {e}"))?;
    let mut out = String::new();
    for name in entries {
        if let Ok(mut entry) = zip.by_name(name) {
            let mut xml = String::new();
            entry.read_to_string(&mut xml).map_err(|e| e.to_string())?;
            out.push_str(&strip_xml_text(&xml));
            out.push('\n');
        }
    }
    Ok(out)
}

/// Read all zip entries whose name starts with `prefix` (or any xhtml/html for EPUB) and strip tags.
fn extract_office_glob(path: &str, prefix: &str) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("not a valid file: {e}"))?;
    let names: Vec<String> = (0..zip.len())
        .filter_map(|i| zip.by_index(i).ok().map(|e| e.name().to_string()))
        .filter(|n| {
            if prefix.is_empty() { n.ends_with(".xhtml") || n.ends_with(".html") || n.ends_with(".htm") }
            else { n.starts_with(prefix) && n.ends_with(".xml") }
        })
        .collect();
    let mut out = String::new();
    for name in names {
        if let Ok(mut entry) = zip.by_name(&name) {
            let mut xml = String::new();
            if entry.read_to_string(&mut xml).is_ok() {
                out.push_str(&strip_xml_text(&xml));
                out.push('\n');
            }
        }
    }
    Ok(out)
}

/// Strip XML/HTML tags, keeping text. Inserts spaces at tag boundaries so words don't merge.
fn strip_xml_text(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len() / 2);
    let mut in_tag = false;
    for ch in xml.chars() {
        match ch {
            '<' => { in_tag = true; out.push(' '); }
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    // decode a few common entities + collapse runs of whitespace
    let decoded = out.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ");
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strips_xml() {
        assert_eq!(strip_xml_text("<w:t>Hello</w:t><w:t>world</w:t>"), "Hello world");
        assert_eq!(strip_xml_text("<p>a&amp;b</p>"), "a&b");
    }
}
