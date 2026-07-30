import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "./helpers.js";

/* Media in and media out.
 *
 * Both defects these tests pin down were found against a real `wrangler dev`
 * rather than here, which is the reason the file exists: the signed URL and
 * the response Meta actually receives are easy to get subtly wrong in ways a
 * happy-path unit test never notices.
 */

const ORIGIN = "https://test.example.com";
const PASSWORD = "correct-horse-battery-staple";

let seq = 0;

async function signIn(): Promise<string> {
  const response = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";")[0];
}

/** Walks the real flow: create the post, ask for a signed URL, PUT the bytes.
 *
 *  The post has to exist first — `media.post_id` is a foreign key. Getting
 *  that order wrong is exactly the bug this helper's shape now prevents. */
async function upload(
  cookie: string,
  filename: string,
  body: string,
): Promise<{ key: string; uploadUrl: string }> {
  const postId = `post-${++seq}`;
  await env.DB.prepare(
    `INSERT INTO posts (id, kind, caption, created_at, updated_at)
     VALUES (?, 'image', '', ?, ?)`,
  )
    .bind(postId, new Date().toISOString(), new Date().toISOString())
    .run();

  const response = await SELF.fetch(`${ORIGIN}/api/media/upload-url`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      postId,
      filename,
      mime: "image/jpeg",
      bytes: body.length,
      position: 0,
    }),
  });
  expect(response.status).toBe(200);
  const { uploadUrl, key } = (await response.json()) as {
    uploadUrl: string;
    key: string;
  };

  const put = await SELF.fetch(uploadUrl, {
    method: "PUT",
    headers: { cookie, "content-type": "image/jpeg" },
    body,
  });
  expect(put.status).toBe(200);
  return { key, uploadUrl };
}

describe("media upload", () => {
  beforeEach(applySchema);

  /* Regression. Media keys end in a filename, filenames contain a dot, and
   * the token used to be percent-encoded — which left the dot in place and
   * produced a four-part token that failed its own three-part parse. Every
   * signed URL for a real file 403'd. */
  it.each(["shot.jpg", "my.photo.final.jpg", "a b&c.jpg", "café.jpg"])(
    "signs a working URL for %s",
    async (filename) => {
      const cookie = await signIn();
      const { key } = await upload(cookie, filename, "hello-bytes");
      expect(await env.MEDIA.get(key)).not.toBeNull();
    },
  );

  it("records the media row so publishing can find it", async () => {
    const cookie = await signIn();
    const { key } = await upload(cookie, "shot.jpg", "hello-bytes");
    const row = await env.DB.prepare(
      `SELECT mime, position FROM media WHERE r2_key = ?`,
    )
      .bind(key)
      .first<{ mime: string; position: number }>();
    expect(row).toMatchObject({ mime: "image/jpeg", position: 0 });
  });

  it("refuses PNG before it wastes a publish attempt", async () => {
    const cookie = await signIn();
    const response = await SELF.fetch(`${ORIGIN}/api/media/upload-url`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        postId: "p",
        filename: "x.png",
        mime: "image/png",
        bytes: 10,
        position: 0,
      }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/PNG/);
  });

  it("refuses an image over 8 MB", async () => {
    const cookie = await signIn();
    const response = await SELF.fetch(`${ORIGIN}/api/media/upload-url`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        postId: "p",
        filename: "big.jpg",
        mime: "image/jpeg",
        bytes: 9 * 1024 * 1024,
        position: 0,
      }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects an upload with no token", async () => {
    const cookie = await signIn();
    const response = await SELF.fetch(`${ORIGIN}/api/media/upload`, {
      method: "PUT",
      headers: { cookie },
      body: "bytes",
    });
    expect(response.status).toBe(403);
  });

  it("rejects an upload whose token was edited", async () => {
    const cookie = await signIn();
    const { uploadUrl } = await upload(cookie, "shot.jpg", "hello");
    const response = await SELF.fetch(`${uploadUrl}TAMPER`, {
      method: "PUT",
      headers: { cookie },
      body: "different bytes",
    });
    expect(response.status).toBe(403);
  });
});

describe("media fetch — what Meta actually receives", () => {
  beforeEach(applySchema);

  /** Mints a fetch URL the way the scheduler does, straight from the module. */
  async function fetchUrlFor(key: string): Promise<string> {
    const { signFetchUrl } = await import("../worker/lib/r2.js");
    return signFetchUrl(env, key);
  }

  /* Regression. `object.range` is populated by R2 even for an unranged get,
   * so keying the 206 off it answered every plain GET with a 206 and a
   * full-body Content-Range. Meta asks for the whole object. */
  it("answers a plain GET with 200, not 206", async () => {
    const cookie = await signIn();
    const { key } = await upload(cookie, "shot.jpg", "hello-bytes");

    // Deliberately no cookie: the caller is Meta's fetcher, which has none.
    const response = await SELF.fetch(await fetchUrlFor(key));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-range")).toBeNull();
    expect(await response.text()).toBe("hello-bytes");
  });

  it("honours a range request, which is what video fetchers use", async () => {
    const cookie = await signIn();
    const { key } = await upload(cookie, "clip.jpg", "hello-bytes");

    const response = await SELF.fetch(await fetchUrlFor(key), {
      headers: { range: "bytes=0-4" },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-4/11");
    expect(await response.text()).toBe("hello");
  });

  it("404s once the object has been cleaned up after publishing", async () => {
    const cookie = await signIn();
    const { key } = await upload(cookie, "shot.jpg", "hello");
    await env.MEDIA.delete(key);

    const response = await SELF.fetch(await fetchUrlFor(key));
    expect(response.status).toBe(404);
  });

  it("refuses a token with no signature at all", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/media/fetch?t=nonsense`);
    expect(response.status).toBe(403);
  });
});
