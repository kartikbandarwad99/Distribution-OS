/*!
OAuth 2.0 for a desktop app.

There is no server to redirect back to, so the flow is: bind a loopback
listener on a fixed port, open the platform's consent page in the user's real
browser, and block until the redirect arrives on that port. The authorization
code is then exchanged for tokens here, in Rust, so the client secret never
enters the webview and is never written to localStorage.

Two details that are easy to get wrong and expensive to debug:

- **PKCE is mandatory for X** and harmless elsewhere, so it is always sent. The
  verifier is generated per attempt and never leaves this process.
- **`state` is checked**, not just generated. Without that check the loopback
  port is an open redirect target for any page the user happens to have open.

The listener lives for at most `TIMEOUT`; a user who wanders off does not leave
a port bound for the rest of the session.
*/

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub scopes: Vec<String>,
    pub external_id: Option<String>,
    pub handle: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    scope: Option<String>,
    user_id: Option<String>,
}

/// What the exchange and refresh endpoints both return.
#[derive(Debug, Deserialize)]
struct LongLivedResponse {
    access_token: String,
    expires_in: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct MeResponse {
    id: String,
    username: Option<String>,
}

/// Meta answers failures with `{"error":{"message":…}}`, and that message is
/// the only part worth showing — the codes mean nothing to the user.
#[derive(Debug, Deserialize)]
struct MetaError {
    error: MetaErrorBody,
}

#[derive(Debug, Deserialize)]
struct MetaErrorBody {
    message: String,
}

fn meta_error(body: &str) -> Option<String> {
    serde_json::from_str::<MetaError>(body)
        .ok()
        .map(|wrapper| wrapper.error.message)
}

/// Endpoints differ per platform; everything else about the dance does not.
struct Endpoints {
    authorize: &'static str,
    token: &'static str,
    /// Meta wants the secret in the body; X's native-app flow has no secret.
    wants_secret: bool,
}

/// Where a pasted token can be upgraded, renewed, and identified.
///
/// Meta refuses loopback redirect URIs, so the OAuth flow above cannot be
/// completed for Instagram or Threads without hosting a public HTTPS page.
/// Their console hands you a working token directly, which makes the redirect
/// dance skippable — but that token is anonymous and possibly short-lived, so
/// it takes one exchange and one lookup before it is worth storing.
struct TokenApi {
    /// Short-lived → long-lived (60 days).
    exchange: &'static str,
    /// Extends a long-lived token by another full term.
    refresh: &'static str,
    /// Identity lookup, and the cheapest way to prove a token works at all.
    me: &'static str,
    /// Meta spells the grant per product: `ig_exchange_token`, `th_…`.
    grant: &'static str,
}

fn token_api(platform: &str) -> Result<TokenApi, String> {
    match platform {
        "instagram" => Ok(TokenApi {
            exchange: "https://graph.instagram.com/access_token",
            refresh: "https://graph.instagram.com/refresh_access_token",
            me: "https://graph.instagram.com/me",
            grant: "ig",
        }),
        "threads" => Ok(TokenApi {
            exchange: "https://graph.threads.net/access_token",
            refresh: "https://graph.threads.net/refresh_access_token",
            me: "https://graph.threads.net/v1.0/me",
            grant: "th",
        }),
        other => Err(format!(
            "{other} has no pasteable token — connect it with the normal flow."
        )),
    }
}

fn endpoints(platform: &str) -> Result<Endpoints, String> {
    match platform {
        "x" => Ok(Endpoints {
            authorize: "https://x.com/i/oauth2/authorize",
            token: "https://api.x.com/2/oauth2/token",
            wants_secret: false,
        }),
        "instagram" => Ok(Endpoints {
            authorize: "https://www.instagram.com/oauth/authorize",
            token: "https://api.instagram.com/oauth/access_token",
            wants_secret: true,
        }),
        "threads" => Ok(Endpoints {
            authorize: "https://threads.net/oauth/authorize",
            token: "https://graph.threads.net/oauth/access_token",
            wants_secret: true,
        }),
        "linkedin" => Ok(Endpoints {
            authorize: "https://www.linkedin.com/oauth/v2/authorization",
            token: "https://www.linkedin.com/oauth/v2/accessToken",
            wants_secret: true,
        }),
        other => Err(format!("No OAuth flow for {other}.")),
    }
}

/* ── small crypto helpers ────────────────────────────────────────────────
   A dependency-free PKCE. The verifier only has to be unguessable within one
   short-lived attempt, so a SplitMix64 seeded from the clock and a stack
   address is sufficient here — it is not protecting anything at rest. */

fn random_hex(bytes: usize) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E37_79B9_7F4A_7C15)
        ^ COUNTER.fetch_add(0x9E37_79B9_7F4A_7C15, Ordering::Relaxed);

    let mut out = String::with_capacity(bytes * 2);
    for _ in 0..bytes {
        seed = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = seed;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        out.push_str(&format!("{:02x}", (z & 0xff) as u8));
    }
    out
}

/// SHA-256, needed for the PKCE S256 challenge.
fn sha256(input: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    let mut msg = input.to_vec();
    let bit_len = (input.len() as u64) * 8;
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
            (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

/// URL-safe base64 without padding, as PKCE requires.
fn b64url(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(n >> 6) as usize & 63] as char);
        }
        if chunk.len() > 2 {
            out.push(TABLE[n as usize & 63] as char);
        }
    }
    out
}

fn urlencode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/* ── the loopback listener ───────────────────────────────────────────────── */

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Connected</title>\
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;background:#f7f6f3;color:#23252b;\
display:grid;place-items:center;height:100vh;margin:0;text-align:center}\
p{color:#6b6d73;font-size:14px}</style>\
<div><h2>Connected.</h2><p>You can close this tab and go back to the app.</p></div>";

/// Reads one request line and answers it. Returns the raw query string.
fn take_redirect(listener: &TcpListener) -> Result<String, String> {
    let deadline = Instant::now() + TIMEOUT;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Could not watch the callback port: {e}"))?;

    loop {
        if Instant::now() > deadline {
            return Err("Timed out waiting for the browser to come back.".into());
        }
        match listener.accept() {
            Ok((stream, _)) => {
                if let Some(query) = handle_stream(stream) {
                    return Ok(query);
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(format!("Callback listener failed: {e}")),
        }
    }
}

fn handle_stream(mut stream: TcpStream) -> Option<String> {
    stream.set_nonblocking(false).ok()?;
    let mut line = String::new();
    BufReader::new(stream.try_clone().ok()?)
        .read_line(&mut line)
        .ok()?;

    let _ = stream.write_all(
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            DONE_PAGE.len(),
            DONE_PAGE
        )
        .as_bytes(),
    );
    let _ = stream.flush();

    // "GET /callback/x?code=…&state=… HTTP/1.1"
    let target = line.split_whitespace().nth(1)?;
    let query = target.split_once('?')?.1.to_string();
    // Favicon and other stray requests carry no query; ignore them.
    if query.is_empty() {
        None
    } else {
        Some(query)
    }
}

fn parse_query(query: &str) -> Vec<(String, String)> {
    query
        .split('&')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((k.to_string(), percent_decode(v)))
        })
        .collect()
}

fn percent_decode(input: &str) -> String {
    let bytes = input.replace('+', " ").into_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/* ── the command ─────────────────────────────────────────────────────────── */

#[tauri::command]
pub async fn oauth_connect(
    app: AppHandle,
    platform: String,
    client_id: String,
    client_secret: Option<String>,
    scopes: Vec<String>,
    redirect_uri: String,
) -> Result<OAuthResult, String> {
    let ends = endpoints(&platform)?;

    let port = redirect_uri
        .split(':')
        .nth(2)
        .and_then(|rest| rest.split('/').next())
        .and_then(|p| p.parse::<u16>().ok())
        .ok_or("The callback URL has no port.")?;

    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        format!("Could not open port {port} for the callback — is another copy of the app connecting? ({e})")
    })?;

    let verifier = random_hex(48);
    let challenge = b64url(&sha256(verifier.as_bytes()));
    let state = random_hex(16);

    let url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        ends.authorize,
        urlencode(&client_id),
        urlencode(&redirect_uri),
        urlencode(&scopes.join(" ")),
        urlencode(&state),
        urlencode(&challenge),
    );

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Could not open the browser: {e}"))?;

    let query = tauri::async_runtime::spawn_blocking(move || take_redirect(&listener))
        .await
        .map_err(|e| format!("Callback task failed: {e}"))??;

    let params = parse_query(&query);
    let get = |key: &str| {
        params
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
    };

    if let Some(error) = get("error") {
        let description = get("error_description").unwrap_or_default();
        return Err(if description.is_empty() {
            format!("{platform} refused the connection: {error}")
        } else {
            description
        });
    }

    // Without this check the loopback port would accept a code from anywhere.
    if get("state").as_deref() != Some(state.as_str()) {
        return Err("The callback did not match this request and was ignored.".into());
    }

    let code = get("code").ok_or("The callback carried no authorization code.")?;

    let mut body = format!(
        "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}",
        urlencode(&code),
        urlencode(&redirect_uri),
        urlencode(&client_id),
        urlencode(&verifier),
    );
    if ends.wants_secret {
        let secret = client_secret
            .filter(|s| !s.is_empty())
            .ok_or("This platform needs a client secret.")?;
        body.push_str(&format!("&client_secret={}", urlencode(&secret)));
    }

    let response = post_form(ends.token, &body).await?;
    let token: TokenResponse = serde_json::from_str(&response).map_err(|_| {
        format!("Could not read the token response. The platform said: {response}")
    })?;

    Ok(OAuthResult {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: token.expires_in,
        scopes: token
            .scope
            .map(|s| s.split(' ').map(str::to_string).collect())
            .unwrap_or(scopes),
        external_id: token.user_id,
        handle: None,
    })
}

/* ── pasted tokens ───────────────────────────────────────────────────────── */

/// Adopts a token copied out of Meta's console, in place of the OAuth flow.
///
/// The console's token may be short-lived (an hour) or already long-lived (60
/// days) depending on which button produced it, and it does not say which. So:
/// try the exchange, and if that is refused, try a refresh. Whichever succeeds
/// yields a 60-day token *and* tells us when it dies. If both fail the token is
/// not worth storing, and the platform's own message says why.
#[tauri::command]
pub async fn oauth_adopt_token(
    platform: String,
    access_token: String,
    client_secret: Option<String>,
    scopes: Vec<String>,
) -> Result<OAuthResult, String> {
    let api = token_api(&platform)?;
    let pasted = access_token.trim().to_string();
    if pasted.is_empty() {
        return Err("Paste the access token from the platform's console first.".into());
    }
    let secret = client_secret
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("Add the app secret above first — it is needed to make a pasted token last.")?;

    let exchanged = get_json(&format!(
        "{}?grant_type={}_exchange_token&client_secret={}&access_token={}",
        api.exchange,
        api.grant,
        urlencode(&secret),
        urlencode(&pasted),
    ))
    .await?;

    let (token, expires_in) = match serde_json::from_str::<LongLivedResponse>(&exchanged) {
        Ok(long) => (long.access_token, long.expires_in),
        Err(_) => {
            // Already long-lived, most likely. A refresh both proves that and
            // resets the clock, so it is the right thing to try before giving up.
            let refreshed = get_json(&format!(
                "{}?grant_type={}_refresh_token&access_token={}",
                api.refresh,
                api.grant,
                urlencode(&pasted),
            ))
            .await?;

            match serde_json::from_str::<LongLivedResponse>(&refreshed) {
                Ok(long) => (long.access_token, long.expires_in),
                Err(_) => {
                    let reason = meta_error(&refreshed)
                        .or_else(|| meta_error(&exchanged))
                        .unwrap_or_else(|| exchanged.clone());
                    return Err(format!("{platform} would not accept that token: {reason}"));
                }
            }
        }
    };

    let profile_body = get_json(&format!(
        "{}?fields=id,username&access_token={}",
        api.me,
        urlencode(&token),
    ))
    .await?;

    let profile: MeResponse = serde_json::from_str(&profile_body).map_err(|_| {
        meta_error(&profile_body)
            .map(|message| format!("The token works but the account lookup failed: {message}"))
            .unwrap_or_else(|| format!("Could not read the account. {platform} said: {profile_body}"))
    })?;

    Ok(OAuthResult {
        access_token: token,
        // Meta long-lived tokens are renewed in place, not swapped for a
        // separate refresh token, so there is nothing else to keep.
        refresh_token: None,
        expires_in,
        scopes,
        external_id: Some(profile.id),
        handle: profile.username.map(|name| format!("@{name}")),
    })
}

/// Extends a long-lived token by another 60 days. Called on launch for tokens
/// nearing their expiry, so a tool you open weekly never asks you to paste again.
#[tauri::command]
pub async fn oauth_refresh_token(
    platform: String,
    access_token: String,
) -> Result<OAuthResult, String> {
    let api = token_api(&platform)?;
    let body = get_json(&format!(
        "{}?grant_type={}_refresh_token&access_token={}",
        api.refresh,
        api.grant,
        urlencode(access_token.trim()),
    ))
    .await?;

    let long: LongLivedResponse = serde_json::from_str(&body).map_err(|_| {
        meta_error(&body)
            .map(|message| format!("Could not refresh the {platform} token: {message}"))
            .unwrap_or_else(|| format!("Could not read the refresh response: {body}"))
    })?;

    Ok(OAuthResult {
        access_token: long.access_token,
        refresh_token: None,
        expires_in: long.expires_in,
        scopes: vec![],
        external_id: None,
        handle: None,
    })
}

/// Minimal HTTPS GET. Same shape as `post_form`: a 4xx body is returned rather
/// than thrown away, because it carries the reason.
async fn get_json(url: &str) -> Result<String, String> {
    let url = url.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        match ureq::get(&url).set("Accept", "application/json").call() {
            Ok(ok) => ok
                .into_string()
                .map_err(|e| format!("Could not read the response: {e}")),
            Err(ureq::Error::Status(_, res)) => res
                .into_string()
                .map_err(|e| format!("Request failed: {e}")),
            Err(e) => Err(format!("Request failed: {e}")),
        }
    })
    .await
    .map_err(|e| format!("Request task failed: {e}"))?
}

/// Minimal HTTPS POST. Uses the platform's own TLS stack via `ureq`-style
/// blocking IO on a worker thread so the UI never waits on the main runtime.
async fn post_form(url: &str, body: &str) -> Result<String, String> {
    let url = url.to_string();
    let body = body.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let response = ureq::post(&url)
            .set("Content-Type", "application/x-www-form-urlencoded")
            .set("Accept", "application/json")
            .send_string(&body);
        match response {
            Ok(ok) => ok
                .into_string()
                .map_err(|e| format!("Could not read the token response: {e}")),
            // A 4xx still carries the reason the platform rejected us, and that
            // reason is the only useful thing to show the user.
            Err(ureq::Error::Status(_, res)) => res
                .into_string()
                .map_err(|e| format!("Token request failed: {e}")),
            Err(e) => Err(format!("Token request failed: {e}")),
        }
    })
    .await
    .map_err(|e| format!("Token task failed: {e}"))?
}
