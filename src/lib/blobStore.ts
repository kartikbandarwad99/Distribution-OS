/*
 * Asset bytes live here, not in the workspace JSON.
 *
 * The previous import path called URL.createObjectURL and stored the blob: URL
 * on the asset. Those URLs are scoped to the document that made them, so every
 * imported image turned into a broken frame the next time the app opened. That
 * is why media never survived a restart.
 *
 * IndexedDB holds the Blob itself; the store keeps only metadata. Object URLs
 * are minted on demand and cached for the life of the session.
 */

const DB_NAME = "distribution-os";
const DB_VERSION = 1;
const STORE = "assets";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export const putBlob = (id: string, blob: Blob): Promise<unknown> =>
  tx("readwrite", (store) => store.put(blob, id));

export const getBlob = (id: string): Promise<Blob | undefined> =>
  tx("readonly", (store) => store.get(id));

export const deleteBlob = (id: string): Promise<unknown> =>
  tx("readwrite", (store) => store.delete(id));

/* A video's still frame is a second blob beside it under this key, so a grid
   can paint a picture without ever instantiating a <video>. */
export const posterKey = (id: string): string => `${id}:poster`;

/* ── object-URL cache ─────────────────────────────────────────────────────
   One URL per asset per session. Revoked only when the asset is deleted, so
   a tile that re-renders never loses its image. */

const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export async function assetUrl(id: string): Promise<string | null> {
  const hit = urls.get(id);
  if (hit) return hit;

  const inflight = pending.get(id);
  if (inflight) return inflight;

  const work = getBlob(id)
    .then((blob) => {
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(id));

  pending.set(id, work);
  return work;
}

export function forgetAsset(id: string): void {
  for (const key of [id, posterKey(id)]) {
    const url = urls.get(key);
    if (url) URL.revokeObjectURL(url);
    urls.delete(key);
    void deleteBlob(key);
  }
}

/** Synchronous peek — non-null once the asset has been resolved once. */
export const cachedUrl = (id: string): string | null => urls.get(id) ?? null;

/** Intrinsic size and duration, so grids can reserve the right aspect box. */
export function probe(
  file: File,
): Promise<{ width: number; height: number; duration: number | null }> {
  const url = URL.createObjectURL(file);
  const done = (result: { width: number; height: number; duration: number | null }) => {
    URL.revokeObjectURL(url);
    return result;
  };

  if (file.type.startsWith("video")) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () =>
        resolve(
          done({
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          }),
        );
      video.onerror = () => resolve(done({ width: 0, height: 0, duration: null }));
      video.src = url;
    });
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve(done({ width: image.naturalWidth, height: image.naturalHeight, duration: null }));
    image.onerror = () => resolve(done({ width: 0, height: 0, duration: null }));
    image.src = url;
  });
}

/* ── video posters ────────────────────────────────────────────────────────
   A <video> paints nothing until it has decoded a frame, which is why every
   imported clip showed as an empty grey box. We decode one frame once, at
   import, and keep it as an ordinary image — so a grid of fifty clips costs
   fifty <img> tags and zero media pipelines. */

/** One decoded frame, a little way in so we skip a black or blank opener. */
export function captureFrame(source: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(source);
    const video = document.createElement("video");
    let settled = false;

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    // A file the decoder cannot open must not hang the import queue.
    const timeout = setTimeout(() => finish(null), 10_000);

    const draw = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return finish(null);
        // Posters are only ever shown in a tile or a rail; full resolution
        // would cost megabytes per clip for no visible gain.
        const scale = Math.min(1, 720 / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.82);
      } catch {
        finish(null);
      }
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => finish(null);
    video.onseeked = draw;
    video.onloadeddata = () => {
      const at = Number.isFinite(video.duration)
        ? Math.min(1, video.duration * 0.1)
        : 0;
      // Seeking fires `seeked`; if we are already there, draw what we have.
      if (at > 0 && Math.abs(video.currentTime - at) > 0.01) {
        video.currentTime = at;
      } else {
        draw();
      }
    };
    video.src = url;
  });
}

/** Capture and store a poster for a video asset. Returns whether one landed. */
export async function makePoster(id: string, source: Blob): Promise<boolean> {
  const frame = await captureFrame(source);
  if (!frame) return false;
  await putBlob(posterKey(id), frame);
  return true;
}

/** The poster's object URL, or null if this asset never got one. */
export async function posterUrl(id: string): Promise<string | null> {
  return assetUrl(posterKey(id));
}

export const cachedPosterUrl = (id: string): string | null =>
  cachedUrl(posterKey(id));
