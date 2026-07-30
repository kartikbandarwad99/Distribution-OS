/* Server accounts, mirrored into the local channel roster.
 *
 * On the web build the source of truth for a connected account is the server's
 * `accounts` table — it is the only place the encrypted token lives. But the
 * rest of the app (the composer, the plan board, tints, cadence) is built
 * around local `Channel` records, and rewriting all of that is not what
 * connecting an account should cost.
 *
 * So: fetch the accounts, and make sure each one has a local channel carrying
 * its `accountId`. The channel is a local shadow of a server row, holding the
 * presentational parts; the token half stays server-side and `auth` is always
 * null here. Publishing addresses `accountId`, never the local id.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "./connect";
import { listAccounts, ServerError, type ServerAccount } from "./server";
import { useStore } from "./store";
import type { Platform } from "./model";

interface Result {
  accounts: ServerAccount[];
  loading: boolean;
  /** null while things are fine, or a message worth showing. */
  error: string | null;
  refresh: () => void;
}

export function useServerAccounts(): Result {
  const store = useStore();
  const [accounts, setAccounts] = useState<ServerAccount[]>([]);
  const [loading, setLoading] = useState(!isTauri);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (isTauri) return;
    let live = true;
    setLoading(true);

    void listAccounts()
      .then((result) => {
        if (!live) return;
        setAccounts(result.accounts);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        // A 401 here means the session lapsed; the gate will catch it on the
        // next reload, and shouting about it in Settings helps nobody.
        if (caught instanceof ServerError && caught.status === 401) return;
        setError(
          caught instanceof Error ? caught.message : "Could not load accounts.",
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [nonce]);

  /* Mirror into local channels. Guarded by a ref rather than by comparing
   * against `store.channels` in the dependency list, which would re-run the
   * effect with every store write and loop. */
  const mirrored = useRef(new Set<string>());
  const addChannel = store.addChannel;
  const updateChannel = store.updateChannel;
  const channels = useRef(store.channels);
  channels.current = store.channels;

  useEffect(() => {
    if (isTauri || !accounts.length) return;

    for (const account of accounts) {
      const existing = channels.current.find(
        (c) =>
          c.accountId === account.id ||
          (c.platform === account.platform &&
            c.handle.replace(/^@/, "") === (account.handle ?? "")),
      );

      if (existing) {
        // Cheap to re-run, but pointless to write the same values back on
        // every render — only touch a channel that has actually drifted.
        if (
          existing.accountId !== account.id ||
          existing.connection !== "connected"
        ) {
          updateChannel(existing.id, {
            accountId: account.id,
            connection: "connected",
            handle: account.handle ? `@${account.handle}` : existing.handle,
            auth: null,
          });
        }
        continue;
      }

      if (mirrored.current.has(account.id)) continue;
      mirrored.current.add(account.id);

      const made = addChannel({
        platform: account.platform as Platform,
        handle: account.handle ? `@${account.handle}` : `@${account.external_id}`,
        project: account.project_id,
      });
      updateChannel(made.id, { accountId: account.id, connection: "connected" });
    }
  }, [accounts, addChannel, updateChannel]);

  return { accounts, loading, error, refresh };
}
