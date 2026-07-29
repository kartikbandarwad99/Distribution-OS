import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { usePrompt } from "../components/Dialog";
import { Avatar } from "../components/UI";
import { parseStamp, untilLabel } from "../lib/dates";
import { Glyph, Icon, type IconName } from "../lib/glyphs";
import { useStore } from "../lib/store";

const NAV: Array<{
  to: string;
  label: string;
  icon: IconName;
  count?: "plan" | "library" | "articles" | "assets";
}> = [
  { to: "/plan", label: "Plan", icon: "cal", count: "plan" },
  { to: "/library", label: "Library", icon: "lib", count: "library" },
  { to: "/articles", label: "Articles", icon: "doc", count: "articles" },
  { to: "/assets", label: "Assets", icon: "film", count: "assets" },
  { to: "/analytics", label: "Analytics", icon: "chart" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const store = useStore();
  const prompt = usePrompt();
  const [query, setQuery] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return store.channels;
    return store.channels.filter(
      (c) =>
        c.handle.toLowerCase().includes(needle) ||
        c.name.toLowerCase().includes(needle),
    );
  }, [query, store.channels]);

  const active = store.settings.activeProjectId;
  const scoped = matching.filter((c) => c.project === active);
  const global = matching.filter((c) => c.project === null);
  const other = matching.filter((c) => c.project && c.project !== active);

  const next = useMemo(() => {
    return store.scopedPieces
      .filter(
        (p) =>
          p.col === "scheduled" &&
          p.scheduledFor &&
          parseStamp(p.scheduledFor).getTime() > Date.now(),
      )
      .sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!))[0];
  }, [store.scopedPieces]);

  const nextChannel = next
    ? store.channels.find((c) => c.id === next.channels[0])
    : null;

  function ChannelRow({ id }: { id: string }) {
    const channel = store.channels.find((c) => c.id === id)!;
    const queued = store.pieces.filter(
      (p) => p.col === "scheduled" && p.channels.includes(channel.id),
    ).length;
    return (
      <button
        className="arow"
        onClick={() => navigate(`/analytics/${channel.id}`)}
      >
        <Avatar channel={channel} size="sm" />
        <span className="ah">{channel.handle}</span>
        <Glyph platform={channel.platform} />
        {channel.connection === "expired" ? (
          <span className="pend bad">
            <Icon.warn />
          </span>
        ) : (
          <span className="pend">{queued || "—"}</span>
        )}
      </button>
    );
  }

  function Group({
    label,
    ids,
    note,
  }: {
    label: string;
    ids: string[];
    note?: string;
  }) {
    if (!ids.length) return null;
    return (
      <div className="agroup">
        <div className="ahead">
          <span>{label}</span>
          {note && <em>{note}</em>}
          <i className="ln" />
        </div>
        {ids.map((id) => (
          <ChannelRow id={id} key={id} />
        ))}
      </div>
    );
  }

  return (
    <aside className="side">
      {/* Space for the real macOS traffic lights, which the Overlay title bar
          paints on top of this strip. Drawing our own here put a second set of
          dots under the system's. */}
      <div className="titlebar" data-tauri-drag-region />

      <div style={{ position: "relative" }}>
        <button className="proj" onClick={() => setProjectOpen((v) => !v)}>
          <span className="pmark">{store.project?.mark ?? "P"}</span>
          <span className="pname">
            <b>{store.project?.name ?? "Project"}</b>
            <em>
              {
                store.channels.filter(
                  (c) => c.project === active || c.project === null,
                ).length
              }{" "}
              channels
            </em>
          </span>
          <Icon.chev />
        </button>
        {projectOpen && (
          <>
            <button
              className="modal-scrim"
              style={{ background: "transparent", zIndex: 30 }}
              aria-label="Close project menu"
              onClick={() => setProjectOpen(false)}
            />
            <div
              className="palette"
              style={{
                position: "absolute",
                top: "100%",
                left: 10,
                right: 10,
                width: "auto",
                translate: "none",
                zIndex: 31,
              }}
            >
              <div className="palette-list">
                {store.projects.map((p) => (
                  <button
                    key={p.id}
                    className={`palette-row ${p.id === active ? "on" : ""}`}
                    onClick={() => {
                      store.updateSettings({ activeProjectId: p.id });
                      setProjectOpen(false);
                    }}
                  >
                    <span
                      className="pmark"
                      style={{ width: 19, height: 19, fontSize: "var(--f-2)" }}
                    >
                      {p.mark}
                    </span>
                    {p.name}
                    {p.id === active && <Icon.check />}
                  </button>
                ))}
                <button
                  className="palette-row"
                  onClick={async () => {
                    setProjectOpen(false);
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
                  New project
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <label className="field">
        <Icon.search />
        <input
          value={query}
          placeholder="Search channels"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>⌘K</kbd>
      </label>

      <nav className="nav">
        {NAV.map((item) => {
          const Mark = Icon[item.icon];
          const count = item.count ? store.counts[item.count] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `navrow ${isActive ? "on" : ""}`}
            >
              <Mark />
              <span className="lbl">{item.label}</span>
              {count > 0 && <span className="c">{count}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="sechead railsec">
        Channels <span className="meta">{store.channels.length}</span>
      </div>
      <div className="accts">
        <Group
          label={store.project?.name ?? "Project"}
          ids={scoped.map((c) => c.id)}
        />
        <Group
          label="Everywhere"
          ids={global.map((c) => c.id)}
          note="all projects"
        />
        <Group label="Other projects" ids={other.map((c) => c.id)} />
        {!store.channels.length && (
          <p
            className="meta"
            style={{ padding: "2px 10px 10px", lineHeight: 1.5 }}
          >
            No channels yet. Connect one and every other screen gets a
            destination.
          </p>
        )}
        <button
          className="addacct"
          onClick={() => navigate("/settings/channels")}
        >
          <Icon.plus />
          <span>Connect a channel…</span>
        </button>
      </div>

      <footer className="nextdue">
        {next?.scheduledFor ? (
          <>
            <i className="pulse" />
            <span>
              Next out <b>{untilLabel(next.scheduledFor)}</b>
              {nextChannel ? ` · ${nextChannel.handle}` : ""}
            </span>
          </>
        ) : (
          <span className="meta">Nothing scheduled</span>
        )}
        <button
          title="Settings"
          aria-label="Settings"
          onClick={() => navigate("/settings")}
        >
          <Icon.gear />
        </button>
      </footer>
    </aside>
  );
}
