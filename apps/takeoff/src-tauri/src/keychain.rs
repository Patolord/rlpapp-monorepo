//! The device token of the company account (`rlp_…`, see `src/lib/account`) lives in the OS
//! credential store: Windows Credential Manager, macOS Keychain (Linux: the session keyring,
//! dev only). Never in the catalog file, localStorage or a project. The token of the local
//! agent endpoint (`agent.rs`) is kept the same way, in an entry of its own. Fixed entries: the
//! frontend cannot read or write any other secret through these commands.

use keyring::Entry;

const SERVICE: &str = "com.rlp.takeoff";
const ACCOUNT: &str = "company-device-token";
const AGENT_ACCOUNT: &str = "agent-endpoint-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

fn agent_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, AGENT_ACCOUNT).map_err(|e| e.to_string())
}

/// The token agents authenticate with: the stored one, or `candidate` stored on first use.
pub fn agent_token(candidate: &str) -> Result<String, String> {
    let entry = agent_entry()?;
    match entry.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => {
            entry.set_password(candidate).map_err(|e| e.to_string())?;
            Ok(candidate.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Replace the agent token (every client configured with the old one is locked out).
pub fn agent_token_replace(token: &str) -> Result<(), String> {
    agent_entry()?
        .set_password(token)
        .map_err(|e| e.to_string())
}

/// The stored device token, or None when signed out.
pub fn get() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn set(token: &str) -> Result<(), String> {
    entry()?.set_password(token).map_err(|e| e.to_string())
}

/// Forget the token; already absent is fine.
pub fn delete() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
