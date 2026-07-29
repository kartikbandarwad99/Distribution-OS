import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { assetAbsPath, isTauri } from "./api";

// Stored paths are relative to the app data dir; the webview needs a URL.
const cache = new Map<string, string>();

export async function resolveAssetUrl(relPath: string): Promise<string> {
  const hit = cache.get(relPath);
  if (hit) return hit;

  let url = relPath;
  if (isTauri) {
    url = convertFileSrc(await assetAbsPath(relPath));
  } else if (!/^(https?:|data:|blob:)/.test(relPath)) {
    // Browser preview has no files on disk; stand in a stable photo so the
    // library's media crops are visible while building.
    const seed =
      Math.abs(
        relPath
          .split("")
          .reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0),
      ) % 1000;
    url = `https://picsum.photos/seed/${seed}/800/1000`;
  }
  cache.set(relPath, url);
  return url;
}

/** Resolved URLs for a list of stored paths; empty entries until they land. */
export function useAssetUrls(paths: string[]): string[] {
  const key = paths.join("|");
  const [urls, setUrls] = useState<string[]>(() =>
    paths.map((p) => cache.get(p) ?? ""),
  );

  useEffect(() => {
    let live = true;
    Promise.all(paths.map(resolveAssetUrl))
      .then((next) => live && setUrls(next))
      .catch(() => live && setUrls(paths.map(() => "")));
    return () => {
      live = false;
    };
    // `key` stands in for the array's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}

const VIDEO_EXTS = ["mp4", "mov", "webm", "m4v", "avi", "mkv"];

export function isVideoPath(path: string): boolean {
  const clean = path.split("?")[0].toLowerCase();
  return VIDEO_EXTS.some((ext) => clean.endsWith("." + ext));
}
