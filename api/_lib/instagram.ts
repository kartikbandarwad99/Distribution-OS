/* Instagram publishing.
 *
 * The shape of every publish is the same, and skipping the middle step is the
 * most common cause of intermittent failures:
 *
 *   1. create a container   POST /{ig-user-id}/media
 *   2. poll until FINISHED  GET  /{container-id}?fields=status_code
 *   3. publish it           POST /{ig-user-id}/media_publish
 *
 * Meta fetches the media itself from the URL in step 1 rather than accepting
 * an upload, which is the entire reason R2 exists in this project. The URL we
 * hand it is presigned and short-lived — see api/_lib/r2.ts. */

const GRAPH = "https://graph.instagram.com/v23.0";

/** Instagram's hard limits. Enforced before upload so a rejection is a clear
 *  message rather than an opaque failure forty seconds into publishing. */
export const LIMITS = {
  captionChars: 2200,
  /** Carousels take 2–10 items. The desktop app's RULES said 20, which was
   *  simply wrong and would have produced a rejection at publish time. */
  carouselMax: 10,
  carouselMin: 2,
  imageBytes: 8 * 1024 * 1024,
  /** Published posts per rolling 24 hours, per account. */
  postsPer24h: 25,
} as const;

export class InstagramError extends Error {}

/** Meta returns { error: { message } }. The numeric codes mean nothing to a
 *  reader, so the message is surfaced verbatim and nothing else is invented. */
async function call(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, string> },
): Promise<Record<string, unknown>> {
  const url = `${GRAPH}${path}`;
  const response = await fetch(url, {
    method: init.method,
    headers: init.body
      ? { "content-type": "application/x-www-form-urlencoded" }
      : undefined,
    body: init.body ? new URLSearchParams(init.body).toString() : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new InstagramError(
      error?.message ?? `Instagram returned ${response.status}.`,
    );
  }
  return payload;
}

/** Blocks until the container is ready to publish. Video genuinely takes time
 *  here — a reel routinely needs thirty seconds or more — so the ceiling is
 *  generous and the failure states are distinguished rather than lumped in
 *  with a timeout. */
async function awaitReady(
  containerId: string,
  accessToken: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await call(
      `/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
      { method: "GET" },
    );
    const status = result.status_code as string;

    if (status === "FINISHED") return;
    if (status === "ERROR") {
      throw new InstagramError(
        "Instagram could not process the media. Check the format — JPEG, under 8 MB, aspect ratio between 4:5 and 1.91:1.",
      );
    }
    if (status === "EXPIRED") {
      throw new InstagramError(
        "The upload container expired before it could be published.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new InstagramError(
    "Instagram was still processing the media after five minutes. It may still publish on their side — check the account before retrying.",
  );
}

async function publishContainer(
  igUserId: string,
  containerId: string,
  accessToken: string,
): Promise<string> {
  const result = await call(`/${igUserId}/media_publish`, {
    method: "POST",
    body: { creation_id: containerId, access_token: accessToken },
  });
  return result.id as string;
}

export interface PublishInput {
  igUserId: string;
  accessToken: string;
  caption: string;
  /** Presigned, short-lived R2 URLs. One for an image or reel, 2–10 for a
   *  carousel, in slide order. */
  mediaUrls: string[];
  kind: "image" | "carousel" | "reel";
}

/** Returns the published media ID. */
export async function publish(input: PublishInput): Promise<string> {
  const { igUserId, accessToken, caption, mediaUrls, kind } = input;

  if (caption.length > LIMITS.captionChars) {
    throw new InstagramError(
      `Caption is ${caption.length} characters; Instagram allows ${LIMITS.captionChars}.`,
    );
  }
  if (mediaUrls.length === 0) {
    throw new InstagramError("Every Instagram post needs media.");
  }

  if (kind === "carousel") {
    if (
      mediaUrls.length < LIMITS.carouselMin ||
      mediaUrls.length > LIMITS.carouselMax
    ) {
      throw new InstagramError(
        `A carousel takes ${LIMITS.carouselMin}–${LIMITS.carouselMax} slides; this one has ${mediaUrls.length}.`,
      );
    }

    // Children carry no caption — only the parent does.
    const children: string[] = [];
    for (const url of mediaUrls) {
      const child = await call(`/${igUserId}/media`, {
        method: "POST",
        body: {
          image_url: url,
          is_carousel_item: "true",
          access_token: accessToken,
        },
      });
      children.push(child.id as string);
    }
    for (const child of children) await awaitReady(child, accessToken);

    const parent = await call(`/${igUserId}/media`, {
      method: "POST",
      body: {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption,
        access_token: accessToken,
      },
    });
    const parentId = parent.id as string;
    await awaitReady(parentId, accessToken);
    return publishContainer(igUserId, parentId, accessToken);
  }

  const body: Record<string, string> =
    kind === "reel"
      ? {
          media_type: "REELS",
          video_url: mediaUrls[0],
          caption,
          access_token: accessToken,
        }
      : { image_url: mediaUrls[0], caption, access_token: accessToken };

  const container = await call(`/${igUserId}/media`, { method: "POST", body });
  const containerId = container.id as string;
  await awaitReady(containerId, accessToken);
  return publishContainer(igUserId, containerId, accessToken);
}

/** Remaining posts in the rolling 24-hour window. Worth checking before a
 *  publish so hitting the cap reads as a limit rather than a crash. */
export async function quotaUsage(
  igUserId: string,
  accessToken: string,
): Promise<{ used: number; limit: number }> {
  const result = await call(
    `/${igUserId}/content_publishing_limit?fields=quota_usage&access_token=${encodeURIComponent(accessToken)}`,
    { method: "GET" },
  );
  const row = (result.data as Array<{ quota_usage?: number }>)?.[0];
  return { used: row?.quota_usage ?? 0, limit: LIMITS.postsPer24h };
}
