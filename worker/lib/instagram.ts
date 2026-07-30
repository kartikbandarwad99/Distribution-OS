/* Instagram publishing, as discrete steps.
 *
 * The shape of every publish is unchanged:
 *
 *   1. create a container   POST /{ig-user-id}/media
 *   2. poll until FINISHED  GET  /{container-id}?fields=status_code
 *   3. publish it           POST /{ig-user-id}/media_publish
 *
 * What changed in the port is that step 2 is no longer a `while` loop inside a
 * single function call. A Durable Object bills wall-clock time while it is
 * active, so a function that sits and awaits Meta for three minutes is billed
 * for three minutes. Each function here does exactly one round trip and
 * returns; the scheduler decides what happens next and goes back to sleep.
 * This also means a crashed wake loses nothing — every intermediate id is
 * written to storage before the next step needs it.
 *
 * Meta fetches the media itself from the URL in step 1 rather than accepting an
 * upload, which is the entire reason R2 exists in this project. The URL we hand
 * it is signed and short-lived — see worker/lib/r2.ts. */

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
  const response = await fetch(`${GRAPH}${path}`, {
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

export type PostKind = "image" | "carousel" | "reel";

/** Checked before any network call so a bad post fails immediately and
 *  legibly, rather than after a container has already been created. */
export function validate(
  kind: PostKind,
  caption: string,
  mediaCount: number,
): void {
  if (caption.length > LIMITS.captionChars) {
    throw new InstagramError(
      `Caption is ${caption.length} characters; Instagram allows ${LIMITS.captionChars}.`,
    );
  }
  if (mediaCount === 0) {
    throw new InstagramError("Every Instagram post needs media.");
  }
  if (
    kind === "carousel" &&
    (mediaCount < LIMITS.carouselMin || mediaCount > LIMITS.carouselMax)
  ) {
    throw new InstagramError(
      `A carousel takes ${LIMITS.carouselMin}–${LIMITS.carouselMax} slides; this one has ${mediaCount}.`,
    );
  }
}

/* ---- step 1: create containers ------------------------------------------ */

/** A single image or reel. Returns the container id. */
export async function createContainer(
  igUserId: string,
  accessToken: string,
  input: { kind: "image" | "reel"; mediaUrl: string; caption: string },
): Promise<string> {
  const body: Record<string, string> =
    input.kind === "reel"
      ? {
          media_type: "REELS",
          video_url: input.mediaUrl,
          caption: input.caption,
          access_token: accessToken,
        }
      : {
          image_url: input.mediaUrl,
          caption: input.caption,
          access_token: accessToken,
        };

  const container = await call(`/${igUserId}/media`, { method: "POST", body });
  return container.id as string;
}

/** One carousel slide. Children carry no caption — only the parent does. */
export async function createCarouselChild(
  igUserId: string,
  accessToken: string,
  mediaUrl: string,
): Promise<string> {
  const child = await call(`/${igUserId}/media`, {
    method: "POST",
    body: {
      image_url: mediaUrl,
      is_carousel_item: "true",
      access_token: accessToken,
    },
  });
  return child.id as string;
}

/** The parent that ties finished children together. Returns its container id. */
export async function createCarouselParent(
  igUserId: string,
  accessToken: string,
  childIds: string[],
  caption: string,
): Promise<string> {
  const parent = await call(`/${igUserId}/media`, {
    method: "POST",
    body: {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
      access_token: accessToken,
    },
  });
  return parent.id as string;
}

/* ---- step 2: one status check, no waiting -------------------------------- */

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED";

/** One round trip. The caller re-arms an alarm and checks again later rather
 *  than sleeping here — see the note at the top of this file. Failure states
 *  are distinguished rather than lumped together, because "Instagram rejected
 *  the file" and "the container expired" need different responses. */
export async function containerStatus(
  containerId: string,
  accessToken: string,
): Promise<ContainerStatus> {
  const result = await call(
    `/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
    { method: "GET" },
  );
  const status = result.status_code as string;

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
  return status === "FINISHED" ? "FINISHED" : "IN_PROGRESS";
}

/* ---- step 3: publish ----------------------------------------------------- */

/** The one call in this file that must never run twice for the same target.
 *  Everything guarding that lives in worker/scheduler.ts. */
export async function publishContainer(
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

/** Meta's own view of the rolling 24-hour window. The scheduler enforces the
 *  cap from its own records first — that costs no subrequest and works even if
 *  this call fails — and this remains available as the authoritative check. */
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
