//! Local endpoint for AI agents: a small HTTP listener on 127.0.0.1 that carries Model Context
//! Protocol messages (`POST /mcp`, JSON-RPC in, JSON out) to the frontend, where the protocol and
//! the tools live (`src/lib/agent`). This file only guards the door and moves bytes:
//!
//! - loopback only, and only while the user has turned the agent on;
//! - a bearer token (kept in the OS credential store) on every request;
//! - no browser: a request carrying an `Origin` header is refused, and `Host` must name the
//!   loopback address, so a web page cannot reach the takeoff (CSRF, DNS rebinding).
//!
//! Plain std networking, like `auth.rs`: one short-lived connection per request.

use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Biggest request head accepted.
const MAX_HEAD_BYTES: usize = 16 * 1024;
/// Biggest request body accepted (tool calls are small JSON; pictures only travel outwards).
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
/// How long a client may take to send its request.
const READ_TIMEOUT: Duration = Duration::from_secs(15);

/// What the frontend answers: an HTTP status and, when it has one, a JSON body.
pub struct Reply {
    pub status: u16,
    pub body: String,
}

impl Reply {
    /// A refusal or failure with a plain reason (no quotes in `message`).
    pub fn error(status: u16, message: &str) -> Self {
        Reply {
            status,
            body: format!("{{\"error\":\"{message}\"}}"),
        }
    }
}

/// Hands a request body to the frontend and waits for its reply.
pub type Forward = dyn Fn(String) -> Reply + Send + Sync;

pub struct Head {
    pub method: String,
    pub path: String,
    headers: Vec<(String, String)>,
}

impl Head {
    /// Value of a header, by case-insensitive name.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// Parse the request line and headers (everything before the blank line).
pub fn parse_head(head: &str) -> Option<Head> {
    let mut lines = head.split("\r\n");
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_string();
    let target = first.next()?;
    let path = target.split('?').next().unwrap_or(target).to_string();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .collect();
    Some(Head {
        method,
        path,
        headers,
    })
}

/// Compare two secrets without stopping at the first different byte.
fn same_secret(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Whether a request may reach the app; otherwise the status and reason to answer with.
pub fn gate(head: &Head, port: u16, token: &str) -> Result<(), (u16, &'static str)> {
    if head.path != "/mcp" {
        return Err((404, "not found"));
    }
    // browsers always send Origin on a cross-site POST; MCP clients are not browsers
    if head.header("origin").is_some() {
        return Err((403, "requests from a browser are not accepted"));
    }
    let host = head.header("host").unwrap_or("");
    if host != format!("127.0.0.1:{port}") && host != format!("localhost:{port}") {
        return Err((403, "unexpected host"));
    }
    let sent = head
        .header("authorization")
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if !same_secret(sent.trim(), token) {
        return Err((401, "missing or wrong bearer token"));
    }
    if head.method != "POST" {
        return Err((405, "only POST is supported"));
    }
    Ok(())
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        411 => "Length Required",
        413 => "Payload Too Large",
        504 => "Gateway Timeout",
        _ => "Internal Server Error",
    }
}

fn respond(stream: &mut TcpStream, reply: &Reply) {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n",
        reply.status,
        reason(reply.status),
        reply.body.len()
    );
    if !reply.body.is_empty() {
        head.push_str("Content-Type: application/json\r\n");
    }
    match reply.status {
        401 => head.push_str("WWW-Authenticate: Bearer\r\n"),
        405 => head.push_str("Allow: POST\r\n"),
        _ => {}
    }
    head.push_str("\r\n");
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(reply.body.as_bytes());
    let _ = stream.flush();
}

/// Read one request: its head and, for a request that passes `check`, its body.
fn read_request(
    stream: &mut TcpStream,
    check: impl Fn(&Head) -> Result<(), (u16, &'static str)>,
) -> Result<String, Reply> {
    let bad = |_| Reply::error(400, "unreadable request");
    stream.set_nonblocking(false).map_err(bad)?;
    stream.set_read_timeout(Some(READ_TIMEOUT)).map_err(bad)?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        if let Some(at) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break at;
        }
        if buf.len() > MAX_HEAD_BYTES {
            return Err(Reply::error(400, "request head too large"));
        }
        let n = stream.read(&mut chunk).map_err(bad)?;
        if n == 0 {
            return Err(Reply::error(400, "incomplete request"));
        }
        buf.extend_from_slice(&chunk[..n]);
    };
    let head = parse_head(&String::from_utf8_lossy(&buf[..head_end]))
        .ok_or_else(|| Reply::error(400, "malformed request"))?;
    check(&head).map_err(|(status, message)| Reply::error(status, message))?;
    let length: usize = head
        .header("content-length")
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| Reply::error(411, "Content-Length is required"))?;
    if length > MAX_BODY_BYTES {
        return Err(Reply::error(413, "request body too large"));
    }
    // curl waits for this before sending a body over 1 kB
    if head
        .header("expect")
        .is_some_and(|v| v.eq_ignore_ascii_case("100-continue"))
    {
        let _ = stream.write_all(b"HTTP/1.1 100 Continue\r\n\r\n");
    }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < length {
        let n = stream.read(&mut chunk).map_err(bad)?;
        if n == 0 {
            return Err(Reply::error(400, "incomplete request body"));
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(length);
    String::from_utf8(body).map_err(|_| Reply::error(400, "the body is not UTF-8"))
}

fn handle(mut stream: TcpStream, port: u16, token: &str, forward: &Forward) {
    let reply = match read_request(&mut stream, |head| gate(head, port, token)) {
        Ok(body) => forward(body),
        Err(refusal) => refusal,
    };
    respond(&mut stream, &reply);
}

/// Bind the loopback interface only.
pub fn listen(port: u16) -> std::io::Result<(u16, TcpListener)> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port))?;
    let port = listener.local_addr()?.port();
    Ok((port, listener))
}

/// Serve requests until `stop` is set, each on its own thread (a tool call can take a while,
/// and a second client must not wait behind it).
pub fn serve(
    listener: TcpListener,
    port: u16,
    token: String,
    stop: Arc<AtomicBool>,
    forward: Arc<Forward>,
) {
    if listener.set_nonblocking(true).is_err() {
        return;
    }
    let token = Arc::new(token);
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, _)) => {
                let token = token.clone();
                let forward = forward.clone();
                std::thread::spawn(move || handle(stream, port, &token, forward.as_ref()));
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    }
}

/// A token as the frontend generates it: 32 to 128 base64url characters.
pub fn is_valid_token(token: &str) -> bool {
    (32..=128).contains(&token.len())
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    fn head(text: &str) -> Head {
        parse_head(text).unwrap()
    }

    #[test]
    fn parses_method_path_and_headers() {
        let h = head("POST /mcp?x=1 HTTP/1.1\r\nHost: 127.0.0.1:9\r\ncontent-length: 2");
        assert_eq!(h.method, "POST");
        assert_eq!(h.path, "/mcp");
        assert_eq!(h.header("HOST"), Some("127.0.0.1:9"));
        assert_eq!(h.header("Content-Length"), Some("2"));
        assert_eq!(h.header("origin"), None);
        assert!(parse_head("").is_none());
    }

    #[test]
    fn lets_only_authorised_local_posts_through() {
        let ok =
            format!("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:9\r\nAuthorization: Bearer {TOKEN}");
        assert!(gate(&head(&ok), 9, TOKEN).is_ok());
        let localhost = ok.replace("127.0.0.1:9", "localhost:9");
        assert!(gate(&head(&localhost), 9, TOKEN).is_ok());

        let status = |text: &str| gate(&head(text), 9, TOKEN).unwrap_err().0;
        assert_eq!(status(&ok.replace("/mcp", "/other")), 404);
        assert_eq!(
            status(&format!("{ok}\r\nOrigin: https://evil.example")),
            403
        );
        assert_eq!(status(&ok.replace("127.0.0.1:9", "evil.example")), 403);
        assert_eq!(status(&ok.replace("127.0.0.1:9", "127.0.0.1:10")), 403);
        assert_eq!(status(&ok.replace(TOKEN, "wrong")), 401);
        assert_eq!(status("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:9"), 401);
        assert_eq!(status(&ok.replace("POST", "GET")), 405);
    }

    #[test]
    fn validates_tokens() {
        assert!(is_valid_token(TOKEN));
        assert!(is_valid_token("AbC-_0123456789AbC-_0123456789xyz"));
        assert!(!is_valid_token("short"));
        assert!(!is_valid_token("0123456789abcdef0123456789abcde/"));
    }

    fn send(port: u16, request: &str) -> String {
        let mut s = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        s.write_all(request.as_bytes()).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn forwards_the_body_and_returns_the_reply() {
        let (port, listener) = listen(0).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let forward: Arc<Forward> = Arc::new(|body| Reply {
            status: if body.is_empty() { 202 } else { 200 },
            body: body.to_uppercase(),
        });
        let server = {
            let stop = stop.clone();
            std::thread::spawn(move || serve(listener, port, TOKEN.to_string(), stop, forward))
        };
        let post = |auth: &str, body: &str| {
            send(
                port,
                &format!(
                    "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {auth}\r\n\
                     Content-Length: {}\r\n\r\n{body}",
                    body.len()
                ),
            )
        };
        let ok = post(TOKEN, "{\"a\":1}");
        assert!(ok.starts_with("HTTP/1.1 200 OK"));
        assert!(ok.contains("Content-Type: application/json"));
        assert!(ok.ends_with("{\"A\":1}"));

        let accepted = post(TOKEN, "");
        assert!(accepted.starts_with("HTTP/1.1 202 Accepted"));
        assert!(accepted.contains("Content-Length: 0"));

        // a refused request never reaches the frontend
        let denied = post("nope", "{\"a\":1}");
        assert!(denied.starts_with("HTTP/1.1 401"));
        assert!(denied.contains("WWW-Authenticate: Bearer"));
        assert!(!denied.contains("{\"A\":1}"));

        let no_length = send(
            port,
            &format!(
                "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {TOKEN}\r\n\r\n"
            ),
        );
        assert!(no_length.starts_with("HTTP/1.1 411"));

        stop.store(true, Ordering::SeqCst);
        server.join().unwrap();
        // the port is free again
        assert!(TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok());
    }
}
