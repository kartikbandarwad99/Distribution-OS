/* Server publishing state, folded back onto the local board.
 *
 * lib/publishing.ts is a write-through: the app pushes a post to the server
 * and the Durable Object takes it from there. Until this file existed there
 * was no return leg. The board therefore kept saying "Scheduled" for posts
 * that had been live on Instagram for hours, and the analytics page — which
 * filters on `col === "published"` — stayed empty however many metrics had
 * been fetched, because no piece ever reached that column.
 *
 * Shaped like lib/metrics.tsx, and for the same reason: the store is local,
 * this is not, and one fetch is shared by every view rather than each view
 * asking separately and disagreeing mid-render.
 *
 * The one difference from metrics is that this hook *does* write to the store.
 * Publishing state is not a decoration on top of a piece — it is which column
 * the card belongs in — so leaving it as a render-time overlay would mean
 * every consumer had to remember to apply it. `reconcilePublished` only ever
 * moves a piece forward into published, so a stale or partial read can never
 * pull a card backwards.
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
import { listTargets, ServerError, type ServerTarget } from "./server";
import { useStore } from "./store";

interface Result {
  /** Every non-draft target the server knows about, by piece id. A piece can
   *  have several — one per connected account. */
  byPiece: Map<string, ServerTarget[]>;
  loading: boolean;
  error: string | null;
  /** Re-read from the server. Called after scheduling, so the card reflects
   *  what just happened without waiting for a reload. */
  refresh: () => void;
}

const EMPTY: Map<string, ServerTarget[]> = new Map();

export function useServerTargets(): Result {
  const store = useStore();
  const { reconcilePublished } = store;
  const [rows, setRows] = useState<ServerTarget[]>([]);
  const [loading, setLoading] = useState(!isTauri);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (isTauri) return;
    let live = true;
    setLoading(true);

    void listTargets()
      .then((result) => {
        if (!live) return;
        setRows(result.targets);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        // The session gate handles 401 on the next reload; a card is not the
        // place to complain about not being logged in.
        if (caught instanceof ServerError && caught.status === 401) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load publishing state.",
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [nonce]);

  const byPiece = useMemo(() => {
    const map = new Map<string, ServerTarget[]>();
    for (const row of rows) {
      const existing = map.get(row.post_id);
      if (existing) existing.push(row);
      else map.set(row.post_id, [row]);
    }
    return map;
  }, [rows]);

  /* A piece counts as published once ANY of its targets is, not all of them.
   * With two accounts and one failure, the piece really did go out — the card
   * belongs in Published with the failure shown on it, rather than sitting in
   * Scheduled pretending nothing happened. The earliest publish time wins, for
   * the same reason: that is when the thing first existed in the world. */
  useEffect(() => {
    const published = new Map<string, string>();
    for (const [postId, targets] of byPiece) {
      for (const target of targets) {
        if (target.state !== "published" || !target.published_at) continue;
        const known = published.get(postId);
        if (!known || target.published_at < known) {
          published.set(postId, target.published_at);
        }
      }
    }
    reconcilePublished(published);
  }, [byPiece, reconcilePublished]);

  return { byPiece, loading, error, refresh };
}

/* ── one fetch for the whole app ─────────────────────────────────────────── */

const TargetsContext = createContext<Result | null>(null);

export function TargetsProvider({ children }: { children: ReactNode }) {
  const value = useServerTargets();
  return createElement(TargetsContext.Provider, { value }, children);
}

/** Null outside the provider — the desktop build mounts neither, and every
 *  caller already treats absent targets as "nothing has been sent". */
export const useTargets = (): Result | null => useContext(TargetsContext);

/** What one piece's publishing looks like, for a card or a badge. Null when
 *  the server has never been told about this piece. */
export interface PieceStatus {
  /** Live on Instagram right now. */
  published: boolean;
  /** Published, then deleted on Instagram — by you or by Meta. */
  removed: boolean;
  /** Somewhere between queued and publishing. */
  inFlight: boolean;
  /** Gave up, or published and needs a human to check. */
  failed: boolean;
  /** The first thing that went wrong, for a tooltip. */
  reason: string | null;
}

export function statusOf(
  targets: ServerTarget[] | undefined,
): PieceStatus | null {
  if (!targets?.length) return null;

  const published = targets.filter((t) => t.state === "published");
  return {
    published: published.length > 0,
    // Only when every published target is gone. One of two accounts still
    // carrying the post means the piece is still out there.
    removed:
      published.length > 0 && published.every((t) => t.removed_at !== null),
    inFlight: targets.some((t) =>
      ["queued", "creating", "awaiting", "publishing"].includes(t.state),
    ),
    failed: targets.some((t) => ["failed", "needs_review"].includes(t.state)),
    reason: targets.find((t) => t.error_reason)?.error_reason ?? null,
  };
}

/** Convenience for a view that has a piece id and wants its status. */
export function usePieceStatus(pieceId: string): PieceStatus | null {
  const targets = useTargets();
  return statusOf((targets?.byPiece ?? EMPTY).get(pieceId));
}
