//! The device token of the company account (`rlp_…`, see `src/lib/account`) lives in the OS
//! credential store: Windows Credential Manager, macOS Keychain (Linux: the session keyring,
//! dev only). Never in the catalog file, localStorage or a project. One fixed entry: the
//! frontend cannot read or write any other secret through these commands.

use keyring::Entry;

const SERVICE: &str = "com.rlp.takeoff";
const ACCOUNT: &str = "company-device-token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
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
