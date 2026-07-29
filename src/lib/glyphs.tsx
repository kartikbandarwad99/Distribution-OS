/* The icon set, lifted verbatim from public/concept-v5.html's `G` map.
   One source only — there used to be two competing sets (text marks in UI.tsx,
   a second SVG set here) and they disagreed on every screen.

   Platform glyphs inherit `currentColor` so a channel's tint reaches them
   through `--ch`. They always travel with the tint, never replace it, so
   colour is never the only carrier of a channel's identity. */

type P = { className?: string };

export const Icon = {
  x: (p: P) => (
    <svg {...p} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.9 10.6 21.3 2h-1.8l-6.4 7.5L8 2H2l7.8 11.3L2 22h1.8l6.8-7.9L16 22h6l-8.1-11.4Zm-2.4 2.8-.8-1.1L4.4 3.3h2.7l5.1 7.3.8 1.1 6.6 9.4h-2.7l-5.4-7.7Z"
      />
    </svg>
  ),
  instagram: (p: P) => (
    <svg {...p} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        d="M7 2.9h10A4.1 4.1 0 0 1 21.1 7v10a4.1 4.1 0 0 1-4.1 4.1H7A4.1 4.1 0 0 1 2.9 17V7A4.1 4.1 0 0 1 7 2.9Z"
      />
      <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
    </svg>
  ),
  threads: (p: P) => (
    <svg {...p} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.5 11.3c-.1 0-.2-.1-.3-.1-.2-3.2-1.9-5-4.8-5-2 0-3.6.9-4.5 2.4l1.6 1.1c.7-1 1.7-1.3 2.9-1.3 1.7 0 2.8.9 3 2.6-.7-.2-1.5-.3-2.3-.3-2.6 0-4.4 1.4-4.4 3.5 0 2 1.7 3.3 3.7 3.3 1.8 0 3.1-.8 3.8-2.2.5.8.8 1.7.9 2.8-1 1-2.6 1.6-4.7 1.6-3.9 0-6.4-2.6-6.4-7.2S7.6 5 11.5 5c3 0 5.1 1.5 5.9 4.3l2-.5C18.4 5 15.6 3 11.5 3 6.3 3 3 6.5 3 12s3.3 9 8.5 9c3 0 5.2-1 6.5-2.6 1-1.2 1.4-2.7 1.3-4.4-.1-1.3-.5-2-1.8-2.7Zm-4.8 4.2c-1 0-1.8-.5-1.8-1.4 0-1 1-1.6 2.5-1.6.7 0 1.4.1 2 .3-.2 1.7-1.2 2.7-2.7 2.7Z"
      />
    </svg>
  ),
  linkedin: (p: P) => (
    <svg {...p} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.77 2.5 4.77 5.76v5.69h-4v-5.05c0-1.2-.02-2.75-1.75-2.75-1.76 0-2.03 1.31-2.03 2.66v5.14h-4v-11Z"
      />
    </svg>
  ),
  medium: (p: P) => (
    <svg {...p} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <ellipse cx="6.6" cy="12" rx="6.4" ry="6.9" fill="currentColor" />
      <ellipse cx="16.9" cy="12" rx="2.7" ry="6.3" fill="currentColor" />
      <ellipse cx="22.3" cy="12" rx="1.1" ry="5.5" fill="currentColor" />
    </svg>
  ),
  reddit: (p: P) => (
    <svg {...p} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22 12a2.1 2.1 0 0 0-3.55-1.5 10.3 10.3 0 0 0-5.4-1.7l.92-4.33 3 .64a1.75 1.75 0 1 0 .2-1.2l-3.6-.77a.6.6 0 0 0-.72.46l-1.07 5.02a10.3 10.3 0 0 0-5.3 1.7A2.1 2.1 0 1 0 4 14.1c0 .13.02.26.04.38C4 14.8 4 15.1 4 15.4c0 3.1 3.6 5.6 8 5.6s8-2.5 8-5.6c0-.3 0-.6-.05-.9A2.1 2.1 0 0 0 22 12ZM8.2 13.6a1.35 1.35 0 1 1 2.7 0 1.35 1.35 0 0 1-2.7 0Zm7.5 3.9c-.9.9-2.6 1-3.7 1s-2.8-.1-3.7-1a.4.4 0 0 1 .57-.57c.6.6 1.9.8 3.13.8s2.53-.2 3.13-.8a.4.4 0 0 1 .57.57Zm-.6-2.55a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Z"
      />
    </svg>
  ),
  search: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.6 10.6 3.1 3.1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  ),
  plus: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  chev: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  left: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  right: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  dots: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="3.4" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="12.6" cy="8" r="1.25" fill="currentColor" />
    </svg>
  ),
  globe: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.4 8h11.2M8 2.4c1.5 1.6 2.2 3.5 2.2 5.6S9.5 12 8 13.6C6.5 12 5.8 10.1 5.8 8S6.5 4 8 2.4Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  play: (p: P) => (
    <svg {...p} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M8 5.2v13.6L19 12 8 5.2Z" />
    </svg>
  ),
  check: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path d="m3.5 8.4 3 3 6-6.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warn: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path d="M8 2.6 14.4 13.4H1.6L8 2.6Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.6v3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r=".85" fill="currentColor" />
    </svg>
  ),
  up: (p: P) => (
    <svg {...p} viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
      <path d="M6 9.5V2.5m0 0L3 5.5M6 2.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  down: (p: P) => (
    <svg {...p} viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
      <path d="M6 2.5v7m0 0 3-3M6 9.5l-3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  close: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  cal: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.2 6.6h11.6M5.4 2.2v2.4M10.6 2.2v2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  grid: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2.2" y="2.2" width="4.6" height="11.6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.2" y="2.2" width="4.6" height="7.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  lib: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2.2" y="2.4" width="5" height="5" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.8" y="2.4" width="5" height="5" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.2" y="8.6" width="5" height="5" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.8" y="8.6" width="5" height="5" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  doc: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.6 2h5.2l3.6 3.6V14H3.6V2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8.6 2v3.8h3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  film: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2" y="3.2" width="12" height="9.6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.4 3.2v9.6M10.6 3.2v9.6" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  chart: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2.4 13.6V9.4M6.1 13.6V4.2M9.9 13.6V7M13.6 13.6V2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  gear: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.6v1.7M8 12.7v1.7M2.4 8H4.1M11.9 8h1.7M4.05 4.05l1.2 1.2M10.75 10.75l1.2 1.2M11.95 4.05l-1.2 1.2M5.25 10.75l-1.2 1.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  link: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.9.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.6 8.7a2.6 2.6 0 0 0 3.7 3.7l.9-.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  copy: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="5.4" y="5.4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M10.6 5.4V4a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5v5.1A1.5 1.5 0 0 0 4 10.6h1.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  ),
  trash: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M3.4 4.6h9.2M6.4 4.6V3.3h3.2v1.3M4.6 4.6l.5 8.1h5.8l.5-8.1" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  image: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect x="2" y="3.2" width="12" height="9.6" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.9" cy="6.5" r="1.1" fill="currentColor" />
      <path d="m2.6 11.4 3.3-3 2.5 2.2 2-1.7 3 2.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  layers: (p: P) => (
    <svg {...p} viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M8 2.3 14 5.6 8 8.9 2 5.6 8 2.3Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="m2.6 8.9 5.4 3 5.4-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
};

export type IconName = keyof typeof Icon;

const PLATFORM_ICON: Record<string, IconName> = {
  x: "x",
  instagram: "instagram",
  threads: "threads",
  linkedin: "linkedin",
  medium: "medium",
  reddit: "reddit",
};

/** The platform mark that always travels with a channel's tint. */
export function Glyph({ platform, tint = false }: { platform: string; tint?: boolean }) {
  const Mark = Icon[PLATFORM_ICON[platform] ?? "globe"];
  return (
    <i className={tint ? "pgl tint" : "pgl"}>
      <Mark />
    </i>
  );
}
