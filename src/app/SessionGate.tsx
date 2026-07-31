/* The password screen.
 *
 * The hosted app holds sixty-day Instagram tokens and can post to a real
 * account, so it is not left open to whoever finds the URL. One shared
 * password, one signed HttpOnly cookie — this is a single-user tool, not a
 * product with accounts.
 *
 * The desktop app renders straight through: there is no server to authenticate
 * against, and the whole point of the Tauri build is that the data never
 * leaves the machine.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isTauri } from "../lib/connect";
import { logIn, session, ServerError } from "../lib/server";
import { Icon } from "../lib/glyphs";

type State = "checking" | "in" | "out";

/* Only a 401 means the password was wrong. Everything else is the server, and
 * saying otherwise sends you hunting for a typo that isn't there — which is
 * exactly what a frontend deployed without its backend did: /api/auth/login
 * 404s, and the gate blamed the password. */
function describe(caught: unknown): string {
  if (!(caught instanceof ServerError)) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (caught.kind === "config") return caught.message;
  if (caught.status === 401) return "That password is not right.";
  if (caught.status === 404) {
    return "The API is not responding (404). The backend is not deployed at this address.";
  }
  return `The server could not sign you in (${caught.status}).`;
}

export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(isTauri ? "in" : "checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isTauri) return;
    let live = true;
    void session()
      .then((result) => {
        if (live) setState(result.authenticated ? "in" : "out");
      })
      .catch(() => {
        // A Worker that cannot answer at all is still a locked door.
        if (live) setState("out");
      });
    return () => {
      live = false;
    };
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await logIn(password);
        setPassword("");
        setState("in");
      } catch (caught) {
        setError(describe(caught));
      } finally {
        setBusy(false);
      }
    },
    [password],
  );

  if (state === "in") return <>{children}</>;

  // Deliberately blank rather than a spinner: the check is one same-origin
  // request and a flash of "loading" is worse than a beat of nothing.
  if (state === "checking") return null;

  return (
    <div className="gate">
      <form className="gatecard" onSubmit={submit}>
        <h1>Distribution OS</h1>
        <p className="sub">This workspace is private.</p>

        <input
          type="password"
          className="inp"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
        />

        {error && (
          <p className="note">
            <Icon.warn />
            <span>{error}</span>
          </p>
        )}

        <button className="btn pri" type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
