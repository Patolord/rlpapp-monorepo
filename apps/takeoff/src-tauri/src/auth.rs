//! Sign-in with the company account: a one-shot listener on 127.0.0.1 that receives the browser
//! redirect of the web page `/takeoff/conectar` (`GET /callback?code=…&state=…`). The PKCE pair,
//! the `state` check and the code exchange live in the frontend (`src/lib/account`); this only
//! hands back the raw query string. Plain std networking, no extra crates.

use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Shown in the browser tab once the app has the code.
const DONE_PAGE: &str = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">\
<title>RLP Takeoff</title></head><body style=\"font-family:system-ui,sans-serif;\
background:#f7f8fc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h1 style=\"font-size:20px\">Pronto</h1>\
<p>Pode voltar ao RLP Takeoff. Esta aba já pode ser fechada.</p></div></body></html>";

/// Biggest request head accepted from the browser.
const MAX_REQUEST_BYTES: usize = 16 * 1024;

/// Bind a free port on the loopback interface only.
pub fn listen() -> std::io::Result<(u16, TcpListener)> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    Ok((port, listener))
}

/// Request target of the first line of an HTTP request (`GET /callback?x=1 HTTP/1.1`).
pub fn request_target(head: &str) -> Option<&str> {
    let line = head.lines().next()?;
    let mut parts = line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    parts.next()
}

/// Query string of a `/callback` target; None for any other path (favicon and the like).
pub fn callback_query(target: &str) -> Option<&str> {
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    (path == "/callback").then_some(query)
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn read_head(stream: &mut TcpStream) -> std::io::Result<String> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 2048];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < MAX_REQUEST_BYTES {
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Wait for the browser to hit `/callback`, answer it with a short page and return the query
/// string. Other requests get a 404 and the wait goes on. Gives up at `timeout` or as soon as
/// `cancel` is set (the user closed the sign-in dialog).
pub fn wait_for_callback(
    listener: TcpListener,
    timeout: Duration,
    cancel: &AtomicBool,
) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelado".into());
        }
        if Instant::now() >= deadline {
            return Err("tempo esgotado esperando o navegador".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let Ok(head) = read_head(&mut stream) else {
                    continue;
                };
                match request_target(&head).and_then(callback_query) {
                    Some(query) => {
                        respond(&mut stream, "200 OK", DONE_PAGE);
                        return Ok(query.to_string());
                    }
                    None => respond(&mut stream, "404 Not Found", ""),
                }
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_callback_target() {
        let head = "GET /callback?code=abc&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        let target = request_target(head).unwrap();
        assert_eq!(callback_query(target), Some("code=abc&state=xyz"));
        assert_eq!(callback_query("/callback"), Some(""));
        assert_eq!(callback_query("/favicon.ico"), None);
        assert_eq!(callback_query("/callbackx?code=1"), None);
        assert_eq!(request_target("POST /callback HTTP/1.1\r\n"), None);
    }

    #[test]
    fn returns_the_query_of_the_first_callback() {
        let (port, listener) = listen().unwrap();
        let client = std::thread::spawn(move || {
            let get = |path: &str| {
                let mut s = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
                write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
                let mut out = String::new();
                s.read_to_string(&mut out).unwrap();
                out
            };
            let missing = get("/favicon.ico");
            let done = get("/callback?code=c0de&state=s1");
            (missing, done)
        });
        let cancel = AtomicBool::new(false);
        let query = wait_for_callback(listener, Duration::from_secs(5), &cancel).unwrap();
        assert_eq!(query, "code=c0de&state=s1");
        let (missing, done) = client.join().unwrap();
        assert!(missing.starts_with("HTTP/1.1 404"));
        assert!(done.starts_with("HTTP/1.1 200") && done.contains("Pronto"));
    }

    #[test]
    fn stops_on_cancel_and_timeout() {
        let (_, listener) = listen().unwrap();
        let cancel = AtomicBool::new(true);
        let err = wait_for_callback(listener, Duration::from_secs(5), &cancel).unwrap_err();
        assert_eq!(err, "cancelado");

        let (_, listener) = listen().unwrap();
        let cancel = AtomicBool::new(false);
        let err = wait_for_callback(listener, Duration::from_millis(100), &cancel).unwrap_err();
        assert!(err.contains("tempo esgotado"));
    }
}
