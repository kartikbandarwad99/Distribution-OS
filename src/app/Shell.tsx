import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandPalette } from "../components/CommandPalette";
import {
  PLATFORM_SETUP,
  expiryStamp,
  isTauri,
  needsRenewal,
  refreshToken,
} from "../lib/connect";
import { useStore } from "../lib/store";
import { AnalyticsView } from "../features/analytics/AnalyticsView";
import { ArticlesView } from "../features/articles/ArticlesView";
import { AssetsView } from "../features/assets/AssetsView";
import { Composer } from "../features/composer/Composer";
import { LibraryView } from "../features/library/LibraryView";
import { PlanView } from "../features/plan/PlanView";
import { SettingsView } from "../features/settings/SettingsView";
import { Sidebar } from "./Sidebar";

/*
 * The composer is owned here rather than by any one route, because a piece can
 * be opened from Plan, Library, Assets and Analytics, and closing it should
 * never navigate you away from where you were.
 */

export type Route =
  | "plan"
  | "library"
  | "articles"
  | "assets"
  | "analytics"
  | "settings";

export function Shell({ route }: { route: Route }) {
  const navigate = useNavigate();
  const store = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const renewed = useRef(false);

  const open = useCallback((id: string) => setEditing(id), []);

  /*
   * Meta's long-lived tokens last 60 days and are renewed in place. Doing that
   * on launch means a tool you open weekly never expires; a failure here is not
   * worth interrupting anyone over, because the token is still valid until it
   * is not, and the channel list already shows expiry.
   */
  useEffect(() => {
    if (!isTauri || renewed.current) return;
    renewed.current = true;

    const due = store.channels.filter(
      (channel) =>
        channel.auth?.accessToken &&
        PLATFORM_SETUP[channel.platform]?.manualToken &&
        needsRenewal(channel.auth.expiresAt),
    );
    if (due.length === 0) return;

    void (async () => {
      for (const channel of due) {
        try {
          const result = await refreshToken(
            channel.platform,
            channel.auth!.accessToken,
          );
          store.updateChannel(channel.id, {
            auth: {
              ...channel.auth!,
              accessToken: result.accessToken,
              expiresAt: expiryStamp(result.expiresIn),
            },
          });
        } catch {
          // Left for the user to notice and re-paste; nothing to do here.
        }
      }
    })();
  }, [store]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target?.matches?.("input,textarea,[contenteditable=true]"),
      );

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing || editing) return;

      const jumps: Record<string, string> = {
        "1": "/plan",
        "2": "/library",
        "3": "/articles",
        "4": "/assets",
        "5": "/analytics",
      };
      if (jumps[event.key]) navigate(jumps[event.key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, editing]);

  return (
    <>
      <div className="app">
        <Sidebar />
        <div className="main">
          {route === "plan" && <PlanView onOpen={open} />}
          {route === "library" && <LibraryView onOpen={open} />}
          {route === "articles" && <ArticlesView />}
          {route === "assets" && <AssetsView onOpen={open} />}
          {route === "analytics" && <AnalyticsView onOpen={open} />}
          {route === "settings" && <SettingsView />}
        </div>
      </div>

      {editing && <Composer pieceId={editing} onClose={() => setEditing(null)} />}

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onCompose={(id) => {
            setPaletteOpen(false);
            open(id);
          }}
        />
      )}
    </>
  );
}
