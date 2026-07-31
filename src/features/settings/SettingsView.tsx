import { useEffect, useState } from "react";
import {
  NavLink,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useConfirm, usePrompt } from "../../components/Dialog";
import { Avatar, Blank, HealthChip, SectionHead, chStyle } from "../../components/UI";
import {
  CONNECTABLE,
  ConnectError,
  type OAuthResult,
  PLATFORM_SETUP,
  DISCONNECT_NOTE,
  SECOND_ACCOUNT_NOTE,
  adoptToken,
  connect,
  expiryStamp,
  instagramConnectUrl,
  isTauri,
} from "../../lib/connect";
import { useServerAccounts } from "../../lib/accounts";
import { canReadInsights } from "../../lib/server";
import { Glyph, Icon } from "../../lib/glyphs";
import {
  PLATFORM_LABEL,
  PLATFORM_TINT,
  PLATFORMS,
  type Platform,
} from "../../lib/model";
import { useStore } from "../../lib/store";

/*
 * Settings is two rooms: the channels you post to, and the workspace itself.
 * Channels come first because until one exists the rest of the app has nowhere
 * to send anything.
 */

export function SettingsView() {
  const { section } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const tab = section === "channels" ? "channels" : "workspace";

  return (
    <>
      <header className="bar">
        <div className="ttl">
          <h1>Settings</h1>
          <div className="sub">{store.project?.name}</div>
        </div>
        <span className="grow" />
        <div className="seg">
          <NavLink
            to="/settings/channels"
            className={tab === "channels" ? "on" : ""}
          >
            Channels
          </NavLink>
          <NavLink to="/settings" end className={tab === "workspace" ? "on" : ""}>
            Workspace
          </NavLink>
        </div>
      </header>
      <div className="scroll">
        {tab === "channels" ? <Channels /> : <Workspace onLeave={() => navigate("/plan")} />}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHANNELS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Files a finished connection onto a channel, whether it arrived by redirect or
 * by paste — the two paths produce the same result, so they end the same way.
 * Attaches to the matching channel if one exists rather than making a duplicate.
 */
function attachResult(
  store: ReturnType<typeof useStore>,
  platform: Platform,
  result: OAuthResult,
) {
  const existing = store.channels.find(
    (c) =>
      c.platform === platform &&
      (result.handle
        ? c.handle.replace(/^@/, "") === result.handle.replace(/^@/, "")
        : true),
  );
  const target =
    existing ??
    store.addChannel({
      platform,
      handle: result.handle ?? `@${platform}`,
    });

  store.updateChannel(target.id, {
    connection: "connected",
    handle: result.handle ?? target.handle,
    auth: {
      externalId: result.externalId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: expiryStamp(result.expiresIn),
      scopes: result.scopes,
    },
  });
}

function Channels() {
  const store = useStore();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [openSetup, setOpenSetup] = useState<Platform | null>(null);
  const [busy, setBusy] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runConnect(platform: Platform) {
    setError(null);
    setBusy(platform);
    try {
      const credentials = store.settings.credentials[platform] ?? {
        clientId: "",
        clientSecret: "",
      };
      const result = await connect(platform, credentials);
      attachResult(store, platform, result);
    } catch (caught) {
      setError(
        caught instanceof ConnectError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Connection failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="setwrap">
      {error && (
        <p className="note">
          <Icon.warn />
          <span>{error}</span>
        </p>
      )}

      <section>
        <SectionHead
          meta={`${store.channels.length} total`}
          right={
            <button className="btn" onClick={() => setAdding(true)}>
              <Icon.plus /> Add by hand
            </button>
          }
        >
          Your channels
        </SectionHead>

        {store.channels.length ? (
          <div className="setgroup" style={{ marginTop: 12 }}>
            {store.channels.map((channel) => (
              <div className="setrow" key={channel.id} style={chStyle(channel)}>
                <Avatar channel={channel} />
                <span className="rowname">
                  <b>{channel.handle}</b>
                  <span>
                    {PLATFORM_LABEL[channel.platform]} ·{" "}
                    {channel.project === null
                      ? "every project"
                      : (store.projects.find((p) => p.id === channel.project)
                          ?.name ?? "—")}
                  </span>
                </span>
                <span className="rowctl">
                  <HealthChip channel={channel} />
                  <select
                    className="sel"
                    value={channel.project ?? "__global"}
                    onChange={(e) =>
                      store.updateChannel(channel.id, {
                        project:
                          e.target.value === "__global" ? null : e.target.value,
                      })
                    }
                  >
                    <option value="__global">Every project</option>
                    {store.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icobtn bare"
                    aria-label={`Remove ${channel.handle}`}
                    title="Remove channel"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Remove ${channel.handle}`,
                        body: "Scheduled pieces stay where they are, but lose this destination.",
                        confirmLabel: "Remove",
                        danger: true,
                      });
                      if (!ok) return;
                      store.deleteChannel(channel.id);
                    }}
                  >
                    <Icon.trash />
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Blank
            icon="link"
            title="No channels yet"
            action={
              <button className="btn pri" onClick={() => setAdding(true)}>
                <Icon.plus /> Add a channel by hand
              </button>
            }
          >
            A channel added by hand works everywhere in the app immediately —
            you write, schedule, and the app reminds you to post. Connecting it
            below is only needed for automatic publishing and real numbers.
          </Blank>
        )}
      </section>

      {/* The hosted build has a public HTTPS callback, which is the one thing
          the desktop app could never have. So on the web the whole
          client-ID/paste-a-token apparatus below is not just unnecessary, it
          is worse — it would put an app secret in a browser. */}
      {isTauri ? <DesktopConnect /> : <WebConnect />}

      {openSetup && (
        <SetupPanel
          platform={openSetup}
          onClose={() => setOpenSetup(null)}
        />
      )}

      {adding && <AddChannel onClose={() => setAdding(false)} />}
    </div>
  );

  function DesktopConnect() {
    return (
      <section>
        <SectionHead meta="automatic publishing">Connect an account</SectionHead>
        <div className="platgrid" style={{ marginTop: 12 }}>
          {CONNECTABLE.map((platform) => {
            const setup = PLATFORM_SETUP[platform]!;
            const credentials = store.settings.credentials[platform];
            const ready = Boolean(credentials?.clientId?.trim());
            const connected = store.channels.filter(
              (c) => c.platform === platform && c.connection === "connected",
            ).length;
            return (
              <article
                key={platform}
                className="platcard"
                style={
                  { ["--ch"]: PLATFORM_TINT[platform] } as React.CSSProperties
                }
              >
                <div className="pn">
                  <span style={{ color: PLATFORM_TINT[platform] }}>
                    <Glyph platform={platform} tint />
                  </span>
                  <b>{setup.label}</b>
                  <span className="grow" />
                  {connected > 0 && (
                    <span className="hchip ok">
                      <Icon.check /> {connected}
                    </span>
                  )}
                </div>
                <p>
                  {setup.canPublish
                    ? "Can post on your behalf once connected."
                    : "Connects for reading; posting still goes through a reminder."}
                </p>
                <footer>
                  <button
                    className="btn ghost"
                    onClick={() =>
                      setOpenSetup(openSetup === platform ? null : platform)
                    }
                  >
                    {ready ? "Credentials" : "Set up"}
                  </button>
                  <span className="grow" />
                  {/* Meta platforms have no redirect to run — connecting them
                      happens by pasting a token inside the setup panel. */}
                  <button
                    className="btn pri"
                    disabled={
                      !setup.manualToken && (!ready || busy === platform)
                    }
                    title={
                      setup.manualToken
                        ? `Paste a ${setup.label} token to connect`
                        : ready
                          ? undefined
                          : "Add your client ID first"
                    }
                    onClick={() =>
                      setup.manualToken
                        ? setOpenSetup(platform)
                        : void runConnect(platform)
                    }
                  >
                    {setup.manualToken
                      ? "Paste token"
                      : busy === platform
                        ? "Waiting…"
                        : "Connect"}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONNECTING ON THE WEB
   ═══════════════════════════════════════════════════════════════════════════

   One link. Meta redirects the browser to the Worker's callback, which trades
   the code for a sixty-day token and encrypts it before it reaches the
   database. No client ID field, no pasted token, no secret in the browser —
   all of which existed only because a desktop app has no public HTTPS URL.

   Connecting is repeatable by design: `accounts` is keyed (platform,
   external_id), so a second account inserts and a reconnect updates in place.
   The part that needs saying out loud is that Meta reuses whatever Instagram
   session the browser already has, which makes "Connect another" look broken
   when it silently reconnects the same account.
   ═══════════════════════════════════════════════════════════════════════════ */

function WebConnect() {
  const store = useStore();
  const { accounts, loading, error, refresh, disconnect } = useServerAccounts();
  const [params, setParams] = useSearchParams();
  const confirm = useConfirm();
  /** The account currently being removed, so its own button can say so
   *  without disabling every other row's. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const connected = params.get("connected");
  const failure = params.get("ig_error");

  /* The callback redirects back here with ?connected=<handle>. Pick it up,
   * refetch so the new account appears without a reload, and clear the query
   * so a refresh does not replay the banner forever. */
  useEffect(() => {
    if (!connected && !failure) return;
    if (connected) refresh();
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      next.delete("connected");
      next.delete("ig_error");
      setParams(next, { replace: true });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [connected, failure, params, refresh, setParams]);

  const instagram = accounts.filter((a) => a.platform === "instagram");

  /* Grouped by project, because a second account usually means a second
   * project rather than a spare. */
  const byProject = new Map<string, typeof instagram>();
  for (const account of instagram) {
    const key = account.project_id ?? "__none";
    byProject.set(key, [...(byProject.get(key) ?? []), account]);
  }

  const projectName = (id: string) =>
    id === "__none"
      ? "No project"
      : (store.projects.find((p) => p.id === id)?.name ?? id);

  return (
    <section>
      <SectionHead meta="automatic publishing">Connect an account</SectionHead>

      {connected && (
        <p className="note info" style={{ marginTop: 12 }}>
          <Icon.check />
          <span>
            Connected <b>@{connected}</b>.
          </span>
        </p>
      )}
      {failure && (
        <p className="note" style={{ marginTop: 12 }}>
          <Icon.warn />
          <span>{failure}</span>
        </p>
      )}
      {error && (
        <p className="note" style={{ marginTop: 12 }}>
          <Icon.warn />
          <span>{error}</span>
        </p>
      )}
      {removeError && (
        <p className="note" style={{ marginTop: 12 }}>
          <Icon.warn />
          <span>{removeError}</span>
        </p>
      )}

      {instagram.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {[...byProject.entries()].map(([projectId, group]) => (
            <div key={projectId} className="setgroup" style={{ marginBottom: 10 }}>
              <div className="setrow" style={{ opacity: 0.7 }}>
                <span className="rowname">
                  <b>{projectName(projectId)}</b>
                  <span>
                    {group.length} account{group.length === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
              {group.map((account) => {
                /* Scopes are fixed at issue, so an account connected before
                 * analytics existed can never read insights without going
                 * through the flow again. Saying so here is the difference
                 * between a one-click fix and an analytics page that is
                 * permanently and inexplicably empty. */
                const insights = canReadInsights(account);
                return (
                  <div className="setrow" key={account.id}>
                    <span style={{ color: PLATFORM_TINT.instagram }}>
                      <Glyph platform="instagram" tint />
                    </span>
                    <span className="rowname">
                      <b>@{account.handle ?? account.external_id}</b>
                      <span>
                        {account.status !== "active"
                          ? `Token ${account.status} — reconnect to resume posting`
                          : !insights
                            ? "Connected for posting. Reconnect to enable analytics."
                            : account.expires_at
                              ? `Token good until ${account.expires_at.slice(0, 10)}`
                              : "Connected"}
                      </span>
                    </span>
                    <span className="rowctl">
                      <span
                        className={`hchip ${account.status === "active" && insights ? "ok" : "bad"}`}
                      >
                        {account.status === "active" && insights ? (
                          <Icon.check />
                        ) : (
                          <Icon.warn />
                        )}
                        {account.status === "active"
                          ? insights
                            ? "active"
                            : "no analytics"
                          : account.status}
                      </span>
                      {/* Deliberately not force_reauth: this is the same
                          account, and it is already logged in. */}
                      <a
                        className="btn"
                        href={instagramConnectUrl(account.project_id)}
                      >
                        Reconnect
                      </a>
                      {/* The channel's own trash icon only ever removed the
                          local shadow, which the next load rebuilt from this
                          row. This is the one control that removes the
                          connection itself. */}
                      <button
                        className="btn"
                        disabled={removing === account.id}
                        onClick={async () => {
                          const handle = `@${account.handle ?? account.external_id}`;
                          const ok = await confirm({
                            title: `Disconnect ${handle}`,
                            body:
                              "Removes the connection and this account's scheduled posts and analytics history. " +
                              "Anything already published on Instagram stays there. " +
                              "You can connect the account again later, but the history does not come back.",
                            confirmLabel: "Disconnect",
                            danger: true,
                          });
                          if (!ok) return;

                          setRemoving(account.id);
                          setRemoveError(null);
                          try {
                            await disconnect(account.id);
                          } catch (caught: unknown) {
                            setRemoveError(
                              caught instanceof Error
                                ? caught.message
                                : `Could not disconnect ${handle}.`,
                            );
                          } finally {
                            setRemoving(null);
                          }
                        }}
                      >
                        {removing === account.id ? "Disconnecting…" : "Disconnect"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <p className="note" style={{ marginTop: 10, opacity: 0.75 }}>
            <Icon.warn />
            <span>{DISCONNECT_NOTE}</span>
          </p>
        </div>
      )}

      <article
        className="platcard"
        style={
          {
            marginTop: 12,
            ["--ch"]: PLATFORM_TINT.instagram,
          } as React.CSSProperties
        }
      >
        <div className="pn">
          <span style={{ color: PLATFORM_TINT.instagram }}>
            <Glyph platform="instagram" tint />
          </span>
          <b>Instagram</b>
          <span className="grow" />
          {instagram.length > 0 && (
            <span className="hchip ok">
              <Icon.check /> {instagram.length}
            </span>
          )}
        </div>
        <p>
          {instagram.length
            ? SECOND_ACCOUNT_NOTE
            : "Posts on your behalf. Your account must be a Business or Creator account."}
        </p>
        <footer>
          <span className="grow" />
          {/* An anchor, not a button with a fetch: the response is a 302 to
              Meta and the browser has to follow it itself. */}
          <a
            className="btn pri"
            href={instagramConnectUrl(store.project?.id ?? null, {
              // Only when adding to an existing set. The first connect has no
              // session to force past.
              switchAccount: instagram.length > 0,
            })}
          >
            {loading
              ? "Loading…"
              : instagram.length
                ? "Connect another account"
                : "Connect Instagram"}
          </a>
        </footer>
      </article>
    </section>
  );
}

function SetupPanel({
  platform,
  onClose,
}: {
  platform: Platform;
  onClose: () => void;
}) {
  const store = useStore();
  const setup = PLATFORM_SETUP[platform]!;
  const saved = store.settings.credentials[platform] ?? {
    clientId: "",
    clientSecret: "",
  };
  const [clientId, setClientId] = useState(saved.clientId);
  const [clientSecret, setClientSecret] = useState(saved.clientSecret);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState("");
  const [adopting, setAdopting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenOk, setTokenOk] = useState<string | null>(null);

  return (
    <>
      <button className="modal-scrim" aria-label="Close setup" onClick={onClose} />
      <section className="modal" role="dialog" aria-label={`${setup.label} setup`}>
        <header className="bar">
          <div className="ttl">
            <h1 style={{ fontSize: "var(--f1)" }}>{setup.label} setup</h1>
            <div className="sub">One-time, per platform</div>
          </div>
          <span className="grow" />
          <button className="icobtn bare" aria-label="Close" onClick={onClose}>
            <Icon.close />
          </button>
        </header>

        <div className="scroll" style={{ padding: "18px 22px 24px" }}>
          <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 18 }}>
            <p className="note info">
              <Icon.warn />
              <span>
                A token is issued to an <b>app</b>, not to a person — so before
                this app can post as you, you have to register one with{" "}
                {setup.label} and paste its ID here. It stays on this machine.
              </span>
            </p>

            <div>
              <SectionHead>What to do</SectionHead>
              <ol className="steps" style={{ marginTop: 10 }}>
                {setup.steps.map((step, index) => (
                  <li className="step" key={index}>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <a
                className="btn"
                style={{ marginTop: 12 }}
                href={setup.console}
                target="_blank"
                rel="noreferrer"
              >
                <Icon.link /> Open the {setup.label} console
              </a>
            </div>

            {setup.redirect && (
              <div>
                <SectionHead>Callback URL</SectionHead>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input className="inp mono" readOnly value={setup.redirect} />
                  <button
                    className="btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(setup.redirect!);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    {copied ? <Icon.check /> : <Icon.copy />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="anote">
                  Paste this into the platform's redirect-URI field exactly, including
                  the port. It only listens while you are connecting.
                </p>
              </div>
            )}

            <div>
              <SectionHead>Credentials</SectionHead>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginTop: 10,
                }}
              >
                <label className="lbl-f">
                  Client ID
                  <input
                    className="inp mono"
                    value={clientId}
                    placeholder="Required"
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </label>
                <label className="lbl-f">
                  Client secret
                  <input
                    className="inp mono"
                    type="password"
                    value={clientSecret}
                    placeholder={
                      platform === "x"
                        ? "Leave blank for a native app (PKCE)"
                        : "Required"
                    }
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {setup.manualToken && (
              <div>
                <SectionHead>Access token</SectionHead>
                <p className="anote" style={{ marginTop: 8 }}>
                  {setup.manualToken.why}
                </p>
                <p className="anote">
                  Find it under <b>{setup.manualToken.where}</b>
                </p>
                <textarea
                  className="inp mono"
                  rows={3}
                  value={token}
                  placeholder="IGAA…"
                  spellCheck={false}
                  style={{ marginTop: 10, resize: "vertical" }}
                  onChange={(e) => setToken(e.target.value)}
                />
                {tokenError && (
                  <p className="note" style={{ marginTop: 10 }}>
                    <Icon.warn />
                    <span>{tokenError}</span>
                  </p>
                )}
                {tokenOk && (
                  <p className="anote" style={{ marginTop: 10 }}>
                    Connected as <b>{tokenOk}</b>. Good for 60 days, renewed
                    automatically whenever you open the app.
                  </p>
                )}
                <button
                  className="btn"
                  style={{ marginTop: 10 }}
                  disabled={adopting || !token.trim()}
                  onClick={async () => {
                    setTokenError(null);
                    setTokenOk(null);
                    setAdopting(true);
                    try {
                      const result = await adoptToken(platform, token, {
                        clientId,
                        clientSecret,
                      });
                      // The secret had to be typed for the exchange to work, so
                      // keep it — otherwise closing the dialog loses it.
                      store.updateSettings({
                        credentials: {
                          ...store.settings.credentials,
                          [platform]: { clientId, clientSecret },
                        },
                      });
                      attachResult(store, platform, result);
                      setTokenOk(result.handle ?? "your account");
                      setToken("");
                    } catch (caught) {
                      setTokenError(
                        caught instanceof Error
                          ? caught.message
                          : "Could not use that token.",
                      );
                    } finally {
                      setAdopting(false);
                    }
                  }}
                >
                  {adopting ? "Checking…" : "Use this token"}
                </button>
              </div>
            )}

            {setup.caveat && (
              <p className="note">
                <Icon.warn />
                <span>
                  <b>Worth knowing.</b> {setup.caveat}
                </span>
              </p>
            )}
          </div>
        </div>

        <footer className="modal-foot">
          <span className="meta">Stored locally, never sent anywhere else.</span>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            onClick={() => {
              store.updateSettings({
                credentials: {
                  ...store.settings.credentials,
                  [platform]: { clientId, clientSecret },
                },
              });
              onClose();
            }}
          >
            Save
          </button>
        </footer>
      </section>
    </>
  );
}

function AddChannel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [handle, setHandle] = useState("");
  const [scope, setScope] = useState<string>(store.settings.activeProjectId);

  const valid = handle.trim().length > 1;

  return (
    <>
      <button className="modal-scrim" aria-label="Close" onClick={onClose} />
      <section className="modal sm" role="dialog" aria-label="Add a channel">
        <header className="bar">
          <div className="ttl">
            <h1 style={{ fontSize: "var(--f1)" }}>Add a channel</h1>
            <div className="sub">Works immediately — connect it later</div>
          </div>
          <span className="grow" />
          <button className="icobtn bare" aria-label="Close" onClick={onClose}>
            <Icon.close />
          </button>
        </header>

        <div
          style={{
            padding: "18px 20px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflow: "auto",
          }}
        >
          <div>
            <span className="lbl-f" style={{ marginBottom: 7 }}>
              Platform
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PLATFORMS.map((id) => (
                <button
                  key={id}
                  className={`fchip ${platform === id ? "on" : ""}`}
                  onClick={() => setPlatform(id)}
                >
                  <Glyph platform={id} />
                  {PLATFORM_LABEL[id]}
                </button>
              ))}
            </div>
          </div>

          <label className="lbl-f">
            Handle
            <input
              className="inp"
              value={handle}
              autoFocus
              placeholder={platform === "linkedin" ? "in/yourname" : "@yourname"}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) {
                  store.addChannel({
                    platform,
                    handle: handle.trim(),
                    project: scope === "__global" ? null : scope,
                  });
                  onClose();
                }
              }}
            />
          </label>

          <label className="lbl-f">
            Belongs to
            <select
              className="sel"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {store.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__global">Every project</option>
            </select>
          </label>
        </div>

        <footer className="modal-foot">
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={!valid}
            onClick={() => {
              store.addChannel({
                platform,
                handle: handle.trim(),
                project: scope === "__global" ? null : scope,
              });
              onClose();
            }}
          >
            Add channel
          </button>
        </footer>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WORKSPACE
   ═══════════════════════════════════════════════════════════════════════════ */

function Workspace({ onLeave }: { onLeave: () => void }) {
  const store = useStore();
  const confirm = useConfirm();
  const prompt = usePrompt();

  return (
    <div className="setwrap">
      <section>
        <SectionHead meta={`${store.projects.length}`}>Projects</SectionHead>
        <div className="setgroup" style={{ marginTop: 12 }}>
          {store.projects.map((p) => (
            <div className="setrow" key={p.id}>
              <span className="pmark">{p.mark}</span>
              <span className="rowname">
                <b>{p.name}</b>
                <span>
                  {store.pieces.filter((piece) => piece.projectId === p.id).length}{" "}
                  pieces
                </span>
              </span>
              <span className="rowctl">
                {p.id === store.settings.activeProjectId ? (
                  <span className="hchip ok">
                    <Icon.check /> Active
                  </span>
                ) : (
                  <button
                    className="btn"
                    onClick={() => store.updateSettings({ activeProjectId: p.id })}
                  >
                    Switch to
                  </button>
                )}
                {store.projects.length > 1 && (
                  <button
                    className="icobtn bare"
                    aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Delete “${p.name}”`,
                        body: "Every piece and article inside it goes too. This cannot be undone.",
                        confirmLabel: "Delete project",
                        danger: true,
                      });
                      if (!ok) return;
                      store.deleteProject(p.id);
                    }}
                  >
                    <Icon.trash />
                  </button>
                )}
              </span>
            </div>
          ))}
          <button
            className="setrow"
            onClick={async () => {
              const name = (
                await prompt({
                  title: "New project",
                  body: "A separate roster of channels, pieces and files.",
                  label: "Name",
                  placeholder: "Client work",
                  confirmLabel: "Create",
                })
              )?.trim();
              if (name) store.createProject(name);
            }}
          >
            <Icon.plus />
            <span className="rowname">
              <b>New project</b>
              <span>A separate roster of channels and pieces</span>
            </span>
          </button>
        </div>
      </section>

      <section>
        <SectionHead>Reminders</SectionHead>
        <div className="setgroup" style={{ marginTop: 12 }}>
          <div className="setrow">
            <span className="rowname">
              <b>Warn me before something is due</b>
              <span>
                Applies to every piece that has to be posted by hand.
              </span>
            </span>
            <span className="rowctl">
              <select
                className="sel"
                value={store.settings.reminderMinutes}
                onChange={(e) =>
                  store.updateSettings({
                    reminderMinutes: Number(e.target.value),
                  })
                }
              >
                {[0, 5, 15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "At the time" : `${m} minutes before`}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>
      </section>

      <section>
        <SectionHead>Your data</SectionHead>
        <div className="setgroup" style={{ marginTop: 12 }}>
          <div className="setrow">
            <span className="rowname">
              <b>Export workspace</b>
              <span>
                Everything except media files, as one JSON file you can keep.
              </span>
            </span>
            <span className="rowctl">
              <button
                className="btn"
                onClick={() => {
                  const blob = new Blob(
                    [
                      JSON.stringify(
                        {
                          version: store.version,
                          projects: store.projects,
                          channels: store.channels.map((c) => ({
                            ...c,
                            auth: null,
                          })),
                          pieces: store.pieces,
                          articles: store.articles,
                          assets: store.assets,
                          settings: { ...store.settings, credentials: {} },
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `distribution-${new Date()
                    .toISOString()
                    .slice(0, 10)}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export
              </button>
            </span>
          </div>
          <div className="setrow">
            <span className="rowname">
              <b>Reset everything</b>
              <span>
                Deletes every project, piece and imported file on this machine.
              </span>
            </span>
            <span className="rowctl">
              <button
                className="btn danger"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Reset everything",
                    body: "Every project, channel, piece and imported file on this machine is deleted. This cannot be undone.",
                    confirmLabel: "Delete it all",
                    danger: true,
                  });
                  if (!ok) return;
                  store.resetAll();
                  onLeave();
                }}
              >
                <Icon.trash /> Reset
              </button>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
