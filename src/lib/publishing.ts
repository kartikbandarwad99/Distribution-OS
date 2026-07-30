/* The bridge between the local workspace and the server.
 *
 * HANDOFF.md §7 asked for an explicit choice rather than a drift, so: this is
 * the **write-through** option, not the "move the whole store to the API"
 * option. Only what publishing needs crosses the line — the post, its media
 * bytes, and one target per account. Projects, articles, folders, ordering and
 * the plan board stay in localStorage.
 *
 * That leaves two sources of truth, knowingly. The trade is that publishing
 * works now instead of after a rewrite of ~30 iterated React files, and the
 * seam is one function wide: nothing outside this file knows the server has a
 * different shape.
 *
 * Nothing here runs on the desktop build.
 */

import { getBlob } from "./blobStore";
import { parseStamp } from "./dates";
import * as server from "./server";
import type { Asset, Channel, Piece } from "./model";

export class PublishError extends Error {}

/** Instagram's kinds. The local model has richer ideas about what a piece is;
 *  this is the part the platform can be told about. */
function kindOf(piece: Piece): "image" | "carousel" | "reel" | "text" {
  const slides = piece.slides.filter((s) => s.assetId);
  if (slides.length > 1) return "carousel";
  if (slides.length === 1) return "image";
  return "text";
}

/** The caption Instagram receives. A threaded piece's parts are joined, since
 *  Instagram has one caption and not a thread. */
function captionOf(piece: Piece): string {
  const parts = piece.parts.map((p) => p.body.trim()).filter(Boolean);
  return (parts.length ? parts.join("\n\n") : piece.body).trim();
}

/**
 * Pushes a piece to the server and returns the target ids, one per connected
 * channel. Media is uploaded first, because a target that exists but has no
 * bytes behind it is a scheduled failure.
 *
 * Only channels carrying an `accountId` are included: a hand-added channel is
 * a reminder, not a destination the server can publish to.
 */
export async function syncForPublish(
  piece: Piece,
  channels: Channel[],
  assets: Asset[],
): Promise<Array<{ targetId: string; channelId: string; accountId: string }>> {
  const destinations = channels.filter(
    (c) => piece.channels.includes(c.id) && c.accountId,
  );

  if (!destinations.length) {
    throw new PublishError(
      "None of this piece's channels are connected accounts. Connect one in Settings first.",
    );
  }

  const kind = kindOf(piece);
  if (kind === "text") {
    throw new PublishError(
      "Instagram requires media — add at least one image before publishing.",
    );
  }

  const scheduledAt = piece.scheduledFor
    ? parseStamp(piece.scheduledFor).toISOString()
    : null;

  /* The post row comes first, and the order is load-bearing rather than
   * stylistic: `media.post_id` is a foreign key, so uploading a slide before
   * the post exists fails on the constraint. Nothing is scheduled by this
   * call, so there is no window in which a target could fire without its
   * bytes — that only happens once `schedule` or `publishNow` is called
   * below. */
  const { targets } = await server.upsertPost({
    postId: piece.id,
    kind,
    caption: captionOf(piece),
    projectId: piece.projectId,
    targets: destinations.map((c) => ({
      accountId: c.accountId!,
      scheduledAt,
    })),
  });

  // Then the bytes. Uploads go browser → R2 through a signed URL, so a large
  // file never passes through the Worker's request body.
  const slides = piece.slides.filter((s) => s.assetId);
  for (const [position, slide] of slides.entries()) {
    const asset = assets.find((a) => a.id === slide.assetId);
    if (!asset) {
      throw new PublishError("A slide points at a file that is no longer here.");
    }
    const blob = await getBlob(asset.id);
    if (!blob) {
      throw new PublishError(
        `“${asset.name}” has no bytes stored locally — re-import it before publishing.`,
      );
    }
    await server.uploadMedia({
      postId: piece.id,
      file: blob,
      filename: `${asset.name}.${blob.type.split("/")[1] ?? "jpg"}`,
      position,
    });
  }

  return targets.map((target) => ({
    targetId: target.id,
    accountId: target.accountId,
    channelId:
      destinations.find((c) => c.accountId === target.accountId)?.id ?? "",
  }));
}

/** Sync, then hand every target to the scheduler. The Durable Object stores a
 *  timestamp and is evicted — nothing runs until the post is due. */
export async function schedulePiece(
  piece: Piece,
  channels: Channel[],
  assets: Asset[],
): Promise<number> {
  if (!piece.scheduledFor) {
    throw new PublishError("Pick a time before scheduling this piece.");
  }
  const when = parseStamp(piece.scheduledFor).toISOString();
  const targets = await syncForPublish(piece, channels, assets);

  for (const target of targets) {
    await server.schedule(target.targetId, when);
  }
  return targets.length;
}

/** Sync, then publish immediately. Deliberately the same code path as the
 *  timer: both end in the same Durable Object running the same steps. */
export async function publishPieceNow(
  piece: Piece,
  channels: Channel[],
  assets: Asset[],
): Promise<number> {
  const targets = await syncForPublish(piece, channels, assets);

  for (const target of targets) {
    await server.publishNow(target.targetId);
  }
  return targets.length;
}

/** How publishing is going, for the UI. */
export const targetsFor = (postId: string) => server.listTargets(postId);
