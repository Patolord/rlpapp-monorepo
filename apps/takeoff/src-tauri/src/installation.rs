//! A random id for this installation of the app, generated once (by the frontend) and kept in
//! the app data folder. The company backend uses it to tell installations apart when the same
//! person signs in again: the new device token replaces only this installation's previous one,
//! even if two computers share a name. Not a secret.

use std::path::Path;

/// Same format the backend and the web page accept: 16 to 64 base64url characters.
pub fn is_valid(id: &str) -> bool {
    (16..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The id stored at `path`; when there is none (or it is malformed), `candidate` is stored there
/// and returned, so every later call answers the same id.
pub fn load_or_store(path: &Path, candidate: &str) -> Result<String, String> {
    if let Ok(existing) = std::fs::read_to_string(path) {
        let existing = existing.trim();
        if is_valid(existing) {
            return Ok(existing.to_string());
        }
    }
    if !is_valid(candidate) {
        return Err("id de instalação inválido".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, candidate).map_err(|e| e.to_string())?;
    Ok(candidate.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_the_format() {
        assert!(is_valid("abcdefghijklmnop"));
        assert!(is_valid("A-b_0123456789xyz"));
        assert!(!is_valid("curto"));
        assert!(!is_valid(&"x".repeat(65)));
        assert!(!is_valid("com espaço 0123456789"));
    }

    #[test]
    fn stores_once_then_keeps_answering_the_same_id() {
        let dir = std::env::temp_dir().join(format!("takeoff-installation-{}", std::process::id()));
        let path = dir.join("installation-id");
        let _ = std::fs::remove_dir_all(&dir);
        let first = load_or_store(&path, "first-candidate-0001").unwrap();
        assert_eq!(first, "first-candidate-0001");
        let again = load_or_store(&path, "other-candidate-0002").unwrap();
        assert_eq!(again, "first-candidate-0001");
        // a damaged file is replaced, a bad candidate is refused
        std::fs::write(&path, "??").unwrap();
        assert!(load_or_store(&path, "bad").is_err());
        assert_eq!(
            load_or_store(&path, "third-candidate-0003").unwrap(),
            "third-candidate-0003"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
