/* Hands the browser a URL it can PUT a file straight to.
 *
 * The bytes go browser → R2 without passing through this function, so a 40 MB
 * reel is not constrained by the serverless request body limit and costs
 * nothing to move. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail } from "../_lib/http.js";
import { presignUpload, mediaKey } from "../_lib/r2.js";
import { sql } from "../_lib/db.js";
import { LIMITS } from "../_lib/instagram.js";

interface Body {
  postId: string;
  filename: string;
  mime: string;
  bytes: number;
  position: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only." });
    return;
  }

  try {
    const { postId, filename, mime, bytes, position } = req.body as Body;

    if (!postId || !filename || !mime) {
      res.status(400).json({ error: "postId, filename and mime are required." });
      return;
    }

    // Rejected here rather than forty seconds into a publish, where Meta's
    // only signal is an opaque ERROR status.
    if (mime === "image/png") {
      res.status(400).json({
        error: "Instagram does not reliably accept PNG. Convert to JPEG first.",
      });
      return;
    }
    if (mime.startsWith("image/") && bytes > LIMITS.imageBytes) {
      res.status(400).json({
        error: `Images must be under 8 MB; this one is ${(bytes / 1024 / 1024).toFixed(1)} MB.`,
      });
      return;
    }

    const key = mediaKey(postId, position ?? 0, filename);
    const uploadUrl = await presignUpload(key);

    const db = sql();
    await db`
      insert into media (post_id, r2_key, mime, bytes, position)
      values (${postId}, ${key}, ${mime}, ${bytes ?? 0}, ${position ?? 0})
      on conflict (r2_key) do update set
        mime = excluded.mime, bytes = excluded.bytes
    `;

    res.status(200).json({ uploadUrl, key });
  } catch (error) {
    fail(res, error);
  }
}
