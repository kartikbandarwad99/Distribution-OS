/* Server metrics, folded onto local pieces.
 *
 * Same shape as useServerAccounts and for the same reason: the store is local
 * and the numbers are not. Rather than writing metrics into the store — which
 * would persist a server-owned value into localStorage and let the two drift
 * silently — this hook keeps them beside the store and hands back a lookup the
 * views apply at render time.
 *
 * A piece can have several targets, one per connected account. The piece-level
 * number is their sum, because "how did this piece do" spans everywhere it was
 * posted. Per-account numbers stay available on `byTarget` for anything that
 * wants to break it down.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isTauri } from "./connect";
import {
  listMetrics,
  refreshMetrics,
  ServerError,
  type RefreshResult,
  type ServerMetric,
} from "./server";
import type { Metrics, Piece } from "./model";

interface Result {
  /** Piece id → summed metrics. Absent means nothing has been measured yet,
   *  which the analytics view must render as empty rather than as zero. */
  byPiece: Map<string, Metrics>;
  byTarget: Map<string, ServerMetric>;
  /** When the oldest reading in the set was taken, for "updated 2h ago". */
  oldestFetchedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Go and ask Instagram now, then reload. Returns what happened so the
   *  caller can surface a revoked token rather than silently doing nothing. */
  pull: () => Promise<RefreshResult | null>;
}

/** Adds two readings, treating absent as absent rather than as zero — but
 *  once any account reports a metric, the others contribute 0 to the total.
 *  That is the honest reading of "this piece got N views in total". */
function add(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

export function useServerMetrics(): Result {
  const [rows, setRows] = useState<ServerMetric[]>([]);
  const [loading, setLoading] = useState(!isTauri);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (isTauri) return;
    let live = true;
    setLoading(true);

    void listMetrics()
      .then((result) => {
        if (!live) return;
        setRows(result.metrics);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        // The session gate handles 401 on the next reload; complaining about
        // it inside a chart helps nobody.
        if (caught instanceof ServerError && caught.status === 401) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load metrics.",
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [nonce]);

  const pull = useCallback(async (): Promise<RefreshResult | null> => {
    if (isTauri) return null;
    try {
      const result = await refreshMetrics({ force: true });
      setNonce((n) => n + 1);
      return result;
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Could not refresh metrics.",
      );
      return null;
    }
  }, []);

  /* Derived once per fetch rather than per render. The identity of `byPiece`
   * is a dependency of the views' useMemo blocks, so rebuilding it every
   * render would defeat every one of them. */
  const derived = useMemo(() => {
    const byTarget = new Map<string, ServerMetric>();
    const totals = new Map<
      string,
      Record<
        "reach" | "views" | "likes" | "comments" | "shares" | "saved",
        number | null
      >
    >();

    for (const row of rows) {
      byTarget.set(row.target_id, row);
      const running = totals.get(row.post_id);
      totals.set(
        row.post_id,
        running
          ? {
              reach: add(running.reach, row.reach),
              views: add(running.views, row.views),
              likes: add(running.likes, row.likes),
              comments: add(running.comments, row.comments),
              shares: add(running.shares, row.shares),
              saved: add(running.saved, row.saved),
            }
          : {
              reach: row.reach,
              views: row.views,
              likes: row.likes,
              comments: row.comments,
              shares: row.shares,
              saved: row.saved,
            },
      );
    }

    const byPiece = new Map<string, Metrics>();
    for (const [postId, sum] of totals) {
      byPiece.set(postId, {
        reach: sum.reach ?? 0,
        views: sum.views ?? 0,
        likes: sum.likes ?? 0,
        comments: sum.comments ?? 0,
        shares: sum.shares ?? 0,
        saves: sum.saved ?? 0,
      });
    }

    const oldestFetchedAt = rows.length
      ? rows.reduce(
          (oldest, row) => (row.fetched_at < oldest ? row.fetched_at : oldest),
          rows[0].fetched_at,
        )
      : null;

    return { byPiece, byTarget, oldestFetchedAt };
  }, [rows]);

  return { ...derived, loading, error, refresh, pull };
}

/* ── one fetch for the whole app ───────────────────────────────────────────
   Analytics, Plan and Library all read `piece.metrics`. Calling the hook in
   each would mean three requests for one answer and three chances for them to
   disagree mid-render, so it is fetched once here and shared.
   ────────────────────────────────────────────────────────────────────────── */

const MetricsContext = createContext<Result | null>(null);

export function MetricsProvider({ children }: { children: ReactNode }) {
  const value = useServerMetrics();
  return createElement(MetricsContext.Provider, { value }, children);
}

/** Null outside the provider — the desktop build mounts neither, and every
 *  caller already treats absent metrics as "nothing measured yet". */
export const useMetrics = (): Result | null => useContext(MetricsContext);

/** Overlays server metrics onto pieces for rendering.
 *
 *  The server wins where it has an answer, because it is the only party that
 *  has spoken to Instagram. A piece the server has never measured keeps
 *  whatever it had locally rather than being blanked — that is what stops the
 *  charts flickering to empty on every reload before the fetch lands. */
export function applyMetrics(
  pieces: Piece[],
  byPiece: Map<string, Metrics> | undefined,
): Piece[] {
  if (!byPiece?.size) return pieces;
  return pieces.map((piece) => {
    const measured = byPiece.get(piece.id);
    return measured ? { ...piece, metrics: measured } : piece;
  });
}
