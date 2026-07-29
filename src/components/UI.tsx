import { useEffect, useState, type ReactNode } from "react";
import { assetUrl, cachedPosterUrl, cachedUrl, posterUrl } from "../lib/blobStore";
import { Glyph, Icon, type IconName } from "../lib/glyphs";
import {
  PLATFORM_LABEL,
  passes,
  type Asset,
  type Channel,
} from "../lib/model";
import { useStore } from "../lib/store";

/* Vocabulary shared by every screen. These wrap the prototype's markup exactly
   — `.av`, `.fchip`, `.hchip`, `.tag`, `.seg` — so a view never has to guess
   what a chip looks like, and a change lands everywhere at once. */

/** Hands a channel's tint to any surface that carries its identity. */
export const chStyle = (channel?: Channel | null) =>
  ({ ["--ch"]: channel?.tint ?? "var(--ink-4)" }) as React.CSSProperties;

export function Avatar({
  channel,
  size = "",
}: {
  channel?: Channel | null;
  size?: "" | "lg" | "sm";
}) {
  return (
    <span className={`av ${size}`.trim()} style={chStyle(channel)}>
      {channel?.name[0]?.toUpperCase() ?? "?"}
      {channel && (
        <i className="dot" data-on={channel.connection === "connected"} />
      )}
    </span>
  );
}

export function HealthChip({ channel }: { channel: Channel }) {
  if (channel.connection === "expired") {
    return (
      <span className="hchip bad">
        <Icon.warn /> Reconnect
      </span>
    );
  }
  if (channel.connection === "connected") {
    return (
      <span className="hchip ok">
        <Icon.check /> Connected
      </span>
    );
  }
  return <span className="hchip off">Manual</span>;
}

export function Delta({ value }: { value: number }) {
  if (!value) return <span className="delta flat">—</span>;
  return (
    <span className={`delta ${value > 0 ? "up" : "dn"}`}>
      {value > 0 ? <Icon.up /> : <Icon.down />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function Seg<T extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: Array<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="seg" style={style}>
      {items.map((item) => (
        <button
          key={item.id}
          className={value === item.id ? "on" : ""}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function SectionHead({
  children,
  meta,
  right,
  style,
}: {
  children: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="sechead" style={style}>
      {children}
      {meta && <span className="meta">{meta}</span>}
      <i className="ln" />
      {right}
    </div>
  );
}

/**
 * One filter rail, used by Plan and Analytics. Platforms first, then the
 * handles — "show me only Instagram" and "show me only @kartik.builds" are
 * different questions and both get asked.
 */
export function FilterRail({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { scopedChannels } = useStore();
  if (!scopedChannels.length) return null;

  const platforms = [...new Set(scopedChannels.map((c) => c.platform))];

  return (
    <div className="filters">
      <button
        className={`fchip ${value === "all" ? "on" : ""}`}
        onClick={() => onChange("all")}
      >
        All channels<span className="c">{scopedChannels.length}</span>
      </button>
      {platforms.length > 1 && (
        <>
          <i className="fdiv" />
          {platforms.map((platform) => (
            <button
              key={platform}
              className={`fchip ${value === platform ? "on" : ""}`}
              onClick={() => onChange(platform)}
            >
              <Glyph platform={platform} />
              {PLATFORM_LABEL[platform]}
              <span className="c">
                {scopedChannels.filter((c) => c.platform === platform).length}
              </span>
            </button>
          ))}
        </>
      )}
      <i className="fdiv" />
      {scopedChannels.map((channel) => (
        <button
          key={channel.id}
          className={`fchip ${value === channel.id ? "on" : ""}`}
          onClick={() => onChange(channel.id)}
          title={channel.handle}
        >
          <i className="swatch" style={chStyle(channel)} />
          {channel.handle}
        </button>
      ))}
    </div>
  );
}

/** The key that makes the tint system legible. Only worth drawing past one. */
export function ChannelLegend() {
  const { scopedChannels } = useStore();
  if (scopedChannels.length < 2) return null;
  return (
    <div className="legend">
      <span className="sechead" style={{ marginRight: 4 }}>
        Channel key
      </span>
      {scopedChannels.map((channel) => (
        <span className="lgi" key={channel.id}>
          <i style={chStyle(channel)} />
          {channel.handle}
        </span>
      ))}
    </div>
  );
}

export { passes };

/* ── media ────────────────────────────────────────────────────────────────
   Assets resolve out of IndexedDB, so a frame paints as soon as its blob URL
   lands. `cachedUrl` makes the second render synchronous — a tile that
   scrolls back into view never flashes empty. */

export function useAssetSrc(assetId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    assetId ? cachedUrl(assetId) : null,
  );

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    const hit = cachedUrl(assetId);
    if (hit) {
      setUrl(hit);
      return;
    }
    let live = true;
    void assetUrl(assetId).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [assetId]);

  return url;
}

/** A video's stored still frame, resolved the same way as any other blob. */
export function usePosterSrc(asset?: Asset | null): string | null {
  // Keyed off the blob, not the `hasPoster` flag: the flag is a hint that
  // saves a lookup, and a poster that exists should paint even if the flag
  // never got written back.
  const wants = asset?.type === "video" && asset.hasBlob ? asset.id : null;
  const landed = asset?.hasPoster ?? false;
  const [url, setUrl] = useState<string | null>(() =>
    wants ? cachedPosterUrl(wants) : null,
  );

  // `landed` is in the deps so a poster produced by the backfill, after this
  // frame first rendered, is picked up instead of leaving a grey tile behind.
  useEffect(() => {
    if (!wants) {
      setUrl(null);
      return;
    }
    const hit = cachedPosterUrl(wants);
    if (hit) {
      setUrl(hit);
      return;
    }
    let live = true;
    void posterUrl(wants).then((next) => live && setUrl(next));
    return () => {
      live = false;
    };
  }, [wants, landed]);

  return url;
}

/**
 * The picture inside a `.frame`. Falls back to a tone wash while loading.
 *
 * A video is drawn as its poster, never as a <video>. Mounting the real
 * element in a grid meant every tile held a decoder open and kept painting
 * frames behind the play button; a still image is what a thumbnail is.
 * Playback happens in `VideoPlayer`, on purpose, when asked for.
 */
export function AssetMedia({
  asset,
  tone = 0,
}: {
  asset?: Asset | null;
  tone?: number;
}) {
  const isVideo = asset?.type === "video";
  const poster = usePosterSrc(asset);
  const src = useAssetSrc(!isVideo && asset?.hasBlob ? asset.id : null);
  const resolved = isVideo ? poster : (src ?? asset?.src ?? null);

  return (
    <>
      <div className="ph" data-tone={tone} />
      {resolved && <img src={resolved} alt="" loading="lazy" />}
    </>
  );
}

/**
 * Playback, in a window of its own. Opened from a play button; the element is
 * created here and torn down on close, so no clip is ever decoding in the
 * background of a grid.
 */
export function VideoPlayer({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const src = useAssetSrc(asset.hasBlob ? asset.id : null);
  const poster = usePosterSrc(asset);
  const resolved = src ?? asset.src ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button className="modal-scrim" aria-label="Close player" onClick={onClose} />
      <section className="player" role="dialog" aria-label={asset.name}>
        <div
          className="player-stage"
          style={
            {
              ["--ratio"]:
                asset.width && asset.height
                  ? `${asset.width}/${asset.height}`
                  : "9/16",
            } as React.CSSProperties
          }
        >
          {resolved ? (
            <video
              src={resolved}
              poster={poster ?? undefined}
              controls
              autoPlay
              playsInline
            />
          ) : (
            <div className="ph" />
          )}
        </div>
        <footer className="player-foot">
          <span className="an" title={asset.name}>
            {asset.name}
          </span>
          <span className="grow" />
          <button className="icobtn bare" aria-label="Close" onClick={onClose}>
            <Icon.close />
          </button>
        </footer>
      </section>
    </>
  );
}

/* ── empty states ─────────────────────────────────────────────────────────
   A screen with nothing on it should say what it is for and offer the one
   action that fills it. Never a bare "no results". */

export function Blank({
  icon = "layers",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const Mark = Icon[icon];
  return (
    <div className="blank">
      <span className="mark">
        <Mark />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return <div className="toast">{children}</div>;
}
