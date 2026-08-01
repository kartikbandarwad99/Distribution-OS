/* Reading numbers back off published media.
 *
 * Deliberately split into two calls with different reliability profiles,
 * because Instagram's insights edge is the least stable surface Meta ships:
 *
 *   1. the media node itself — like_count, comments_count. Plain fields, not
 *      insights. Stable across API versions, present for every media type, and
 *      readable without the insights scope at all.
 *   2. the insights edge — reach, views, saved, shares. Volatile: metrics are
 *      renamed and removed between versions, and the supported set differs per
 *      media type (a carousel does not report what a reel reports).
 *
 * Keeping them separate means a rejection on (2) still yields likes and
 * comments rather than losing the whole fetch, which matters because (2) is
 * the half that breaks.
 *
 * This module never throws for a metric Instagram declines to report. Absent
 * is a real answer and is preserved as null — see the note on nullable columns
 * in db/schema.sql. It throws only when the whole media is unreadable, which
 * is a different thing and usually means the token or the post is gone. */

const GRAPH = "https://graph.instagram.com/v23.0";

/** What we ask the insights edge for, in preference order.
 *
 *  `views` rather than `impressions`: Meta deprecated media `impressions` in
 *  favour of `views`, which now spans posts, reels and stories. `impressions`
 *  is not requested at all — asking for a deprecated metric is an error, not
 *  an empty result. */
const WANTED = ["reach", "views", "saved", "shares"] as const;

export interface MediaMetrics {
  igMediaId: string;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  /** Everything Instagram actually returned, for the schema's `raw` column. */
  raw: Record<string, unknown>;
}

export class InsightsError extends Error {}

/** The media node is gone from Instagram — deleted from the app, or removed by
 *  Meta. Distinct from InsightsError because it is permanent: no amount of
 *  retrying brings a deleted post back, so the caller stops asking rather than
 *  spending two subrequests on it every refresh, forever. */
export class MediaGoneError extends InsightsError {}

/** Meta signals a missing node as code 100 / subcode 33, and phrases it as
 *  "Unsupported get request. Object with ID '…' does not exist". Both are
 *  checked: the codes are the contract, the text is the safety net for the
 *  cases where Meta omits the subcode. */
function isGone(payload: Record<string, unknown>): boolean {
  const error = payload.error as
    | { code?: number; error_subcode?: number; message?: string }
    | undefined;
  if (error?.code === 100 && error?.error_subcode === 33) return true;
  return /does not exist|cannot be loaded|Unsupported get request/i.test(
    error?.message ?? "",
  );
}

async function get(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { ok: response.ok, status: response.status, payload };
}

const errorMessage = (payload: Record<string, unknown>): string =>
  ((payload.error as { message?: string } | undefined)?.message ??
    "Instagram declined the request.") as string;

/** Meta names the offending metric in the error text when it rejects one, e.g.
 *  "(#100) The value must be a valid insights metric: shares". Pulling it out
 *  lets one bad metric be dropped instead of the whole call being abandoned —
 *  which is how a carousel still reports reach even though it has no `shares`.
 *
 *  Matching on message text is fragile, so it is the optimisation and not the
 *  correctness story: if nothing matches, the caller falls back to the minimal
 *  metric set rather than guessing. */
function rejectedMetric(message: string, asked: readonly string[]): string | null {
  const hit = asked.find((metric) =>
    new RegExp(`\\b${metric}\\b`, "i").test(message),
  );
  return hit ?? null;
}

/** The insights edge, with one narrowing retry.
 *
 *  Returns whatever came back keyed by metric name. An empty object means
 *  Instagram reported nothing for this media, which is normal for very fresh
 *  posts and for media types with no insights at all. */
async function readInsights(
  igMediaId: string,
  accessToken: string,
): Promise<Record<string, number>> {
  let asked: string[] = [...WANTED];

  for (let attempt = 0; attempt < 3; attempt++) {
    if (asked.length === 0) return {};

    const { ok, payload } = await get(`/${igMediaId}/insights`, {
      metric: asked.join(","),
      access_token: accessToken,
    });

    if (ok) {
      const out: Record<string, number> = {};
      const rows = (payload.data ?? []) as Array<{
        name?: string;
        values?: Array<{ value?: number }>;
        total_value?: { value?: number };
      }>;
      for (const row of rows) {
        if (!row.name) continue;
        // Meta returns some metrics as a `values` series and others as a
        // single `total_value`. Both mean the lifetime number here.
        const value = row.total_value?.value ?? row.values?.[0]?.value;
        if (typeof value === "number") out[row.name] = value;
      }
      return out;
    }

    const message = errorMessage(payload);
    const bad = rejectedMetric(message, asked);
    if (!bad) {
      // Could not identify the culprit. `reach` is the one metric supported by
      // every media type; if even that fails there is nothing here to read.
      if (asked.length === 1) return {};
      asked = ["reach"];
      continue;
    }
    asked = asked.filter((metric) => metric !== bad);
  }

  return {};
}

/** Everything known about one published media. Throws only if the media node
 *  itself cannot be read — a revoked token, a deleted post — because that is a
 *  condition the caller has to record against the account, not a gap in a
 *  chart. */
export async function fetchMediaMetrics(
  igMediaId: string,
  accessToken: string,
): Promise<MediaMetrics> {
  const node = await get(`/${igMediaId}`, {
    fields: "like_count,comments_count,media_type,permalink,timestamp",
    access_token: accessToken,
  });

  if (!node.ok) {
    if (isGone(node.payload)) {
      throw new MediaGoneError(errorMessage(node.payload));
    }
    throw new InsightsError(errorMessage(node.payload));
  }

  const insights = await readInsights(igMediaId, accessToken);

  const number = (value: unknown): number | null =>
    typeof value === "number" ? value : null;

  return {
    igMediaId,
    reach: number(insights.reach),
    views: number(insights.views),
    shares: number(insights.shares),
    saved: number(insights.saved),
    likes: number(node.payload.like_count),
    comments: number(node.payload.comments_count),
    raw: { ...node.payload, insights },
  };
}
