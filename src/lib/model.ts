/* ═══════════════════════════════════════════════════════════════════════════
   THE DOMAIN
   ═══════════════════════════════════════════════════════════════════════════

   One kind of thing moves through this app: a Piece. It starts as an idea,
   gets written, gets a time, goes out, and then carries numbers. Plan shows
   pieces by column; Library shows the ones that reached `published`. They are
   the same rows — which is the point. When Plan and Library were separate
   collections, nothing forced their counts to agree, and they didn't.

   A Piece owns its parts (a thread's posts) and its slides (a carousel's
   images). Neither is a separate table: a thread with no parts is a post, and
   a carousel with one slide is an image. The kind is a lens, not a schema.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Platform =
  | "x"
  | "instagram"
  | "threads"
  | "linkedin"
  | "medium"
  | "reddit";

export type Kind =
  | "post"
  | "thread"
  | "carousel"
  | "reel"
  | "image"
  | "article"
  | "note";

export type Col = "idea" | "drafting" | "ready" | "scheduled" | "published";

/** manual = you post it yourself; connected = we hold a live token. */
export type Connection = "manual" | "connected" | "expired";

export const PLATFORMS: Platform[] = [
  "x",
  "instagram",
  "threads",
  "linkedin",
  "medium",
  "reddit",
];

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
  medium: "Medium",
  reddit: "Reddit",
};

export const KIND_LABEL: Record<Kind, string> = {
  post: "Post",
  thread: "Thread",
  carousel: "Carousel",
  reel: "Reel",
  image: "Image",
  article: "Article",
  note: "Note",
};

export const COLUMNS: Array<{ id: Col; label: string; note: string }> = [
  { id: "idea", label: "Ideas", note: "no shape yet" },
  { id: "drafting", label: "Drafting", note: "being written" },
  { id: "ready", label: "Ready", note: "needs a time" },
  { id: "scheduled", label: "Scheduled", note: "will go out" },
  { id: "published", label: "Published", note: "carries numbers" },
];

/* Platform base tints, from the prototype. A handle's own tint is derived by
   shading this base, so two Instagram accounts read as related but distinct. */
export const PLATFORM_TINT: Record<Platform, string> = {
  x: "#33363d",
  instagram: "#a8577a",
  medium: "#2f7355",
  linkedin: "#35618c",
  threads: "#6d4f96",
  reddit: "#bf5327",
};

/* What each platform will actually accept. Enforced in the composer so a piece
   can never be scheduled into a rejection. */
export interface PlatformRules {
  /** Body characters. null = no meaningful limit. */
  limit: number | null;
  maxSlides: number;
  /** Kinds this platform can receive at all. */
  kinds: Kind[];
  /** True where the platform's API cannot post on your behalf without review. */
  manualOnly: boolean;
}

export const RULES: Record<Platform, PlatformRules> = {
  x: {
    limit: 280,
    maxSlides: 4,
    kinds: ["post", "thread", "image", "carousel"],
    manualOnly: false,
  },
  instagram: {
    limit: 2200,
    maxSlides: 20,
    kinds: ["carousel", "reel", "image", "post"],
    manualOnly: true,
  },
  threads: {
    limit: 500,
    maxSlides: 20,
    kinds: ["post", "thread", "image", "carousel"],
    manualOnly: true,
  },
  linkedin: {
    limit: 3000,
    maxSlides: 20,
    kinds: ["post", "image", "carousel", "article"],
    manualOnly: false,
  },
  medium: {
    limit: null,
    maxSlides: 0,
    kinds: ["article"],
    manualOnly: false,
  },
  reddit: {
    limit: 40000,
    maxSlides: 20,
    kinds: ["post", "image"],
    manualOnly: false,
  },
};

/* ── rows ────────────────────────────────────────────────────────────────── */

export interface Project {
  id: string;
  name: string;
  mark: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  platform: Platform;
  handle: string;
  name: string;
  /** null = the channel belongs to every project. */
  project: string | null;
  tint: string;
  connection: Connection;
  /** Live token material. Never rendered; only its presence is shown. */
  auth: ChannelAuth | null;
  followers: number;
  /** Posts per week you mean to do vs. what actually went out. */
  cadence: { target: number; actual: number };
  createdAt: string;
}

export interface ChannelAuth {
  externalId: string | null;
  accessToken: string;
  refreshToken: string | null;
  /** Local stamp. null = does not expire. */
  expiresAt: string | null;
  scopes: string[];
}

export interface Part {
  id: string;
  body: string;
}

export interface Slide {
  id: string;
  assetId: string | null;
  alt: string;
}

/** Numbers a piece earned. Absent until a platform actually reports them —
    we never invent these; an empty analytics page is the honest one. */
export interface Metrics {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export interface Piece {
  id: string;
  projectId: string;
  col: Col;
  kind: Kind;
  title: string;
  body: string;
  parts: Part[];
  slides: Slide[];
  channels: string[];
  /** Local wall clock 'YYYY-MM-DDTHH:MM:SS'. See lib/dates.ts. */
  scheduledFor: string | null;
  /** Held when a scheduled piece is dragged back, so the time isn't lost. */
  keptScheduledFor: string | null;
  publishedAt: string | null;
  metrics: Metrics | null;
  /** Per-channel published permalinks, keyed by channel id. */
  links: Record<string, string>;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface OutlineItem {
  id: string;
  title: string;
  done: boolean;
}

export interface Article {
  id: string;
  projectId: string;
  title: string;
  deck: string;
  body: string;
  status: "draft" | "scheduled" | "published";
  destinations: string[];
  outline: OutlineItem[];
  scheduledFor: string | null;
  publishedAt: string | null;
  views: number;
  reads: number;
  claps: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  type: "image" | "video";
  /** Bytes live in IndexedDB under this id — see lib/blobStore.ts. The store
      itself holds metadata only, so localStorage never sees a megabyte. */
  hasBlob: boolean;
  /** Video only: a still frame was decoded and stored beside the clip, so
      grids can paint it without mounting a media element. */
  hasPoster?: boolean;
  /** Fallback for assets that came from a path rather than an upload. */
  src: string | null;
  width: number;
  height: number;
  bytes: number;
  duration: number | null;
  folder: string;
  tags: string[];
  createdAt: string;
}

/** Developer credentials for one platform's API. Entered by you, kept local. */
export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  /** Instagram/Threads only: the Business account or user id. */
  accountId?: string;
}

export interface Settings {
  activeProjectId: string;
  reminderMinutes: number;
  /** 'auto' needs a connected channel; 'notify' pings you to post by hand. */
  publishing: Record<string, "auto" | "notify">;
  credentials: Partial<Record<Platform, AppCredentials>>;
}

export interface StoreData {
  version: number;
  projects: Project[];
  channels: Channel[];
  pieces: Piece[];
  articles: Article[];
  assets: Asset[];
  settings: Settings;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

export const fmt = (n: number): string =>
  n >= 1e6
    ? (n / 1e6).toFixed(1) + "M"
    : n >= 1e3
      ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K"
      : String(n);

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A per-handle tint: the platform's base, lightened in fixed steps by how many
 * channels on that platform came before. Keeps every channel distinguishable
 * while still reading as "an Instagram one".
 */
export function deriveTint(platform: Platform, indexOnPlatform: number): string {
  const base = PLATFORM_TINT[platform];
  if (indexOnPlatform === 0) return base;
  const steps = [0, 0.17, -0.13, 0.31, -0.24, 0.44];
  const amount = steps[indexOnPlatform % steps.length];
  return shade(base, amount);
}

/** Positive lightens toward white, negative darkens toward black. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (to - c) * k);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Does this channel pass a filter that may be "all", a platform, or an id? */
export function passes(channel: Channel, filter: string): boolean {
  return (
    filter === "all" || channel.id === filter || channel.platform === filter
  );
}

/** The text that actually goes on the clipboard / down the wire. */
export function pieceText(piece: Piece): string {
  if (piece.kind === "thread" && piece.parts.length) {
    return piece.parts.map((part) => part.body).join("\n\n———\n\n");
  }
  return piece.body;
}

/** Longest single body a piece will ask a platform to accept. */
export function longestBody(piece: Piece): number {
  if (piece.kind === "thread" && piece.parts.length) {
    return Math.max(...piece.parts.map((part) => part.body.length));
  }
  return piece.body.length;
}

export interface Problem {
  channelId: string | null;
  text: string;
}

/**
 * Everything standing between this piece and a clean send. The composer shows
 * these before you can schedule, so a failure is never discovered at 09:00.
 */
export function problems(piece: Piece, channels: Channel[]): Problem[] {
  const found: Problem[] = [];
  const targets = channels.filter((c) => piece.channels.includes(c.id));

  if (!targets.length) found.push({ channelId: null, text: "No channel picked" });
  if (!piece.body.trim() && !piece.parts.some((p) => p.body.trim()) && !piece.slides.length) {
    found.push({ channelId: null, text: "Nothing written yet" });
  }
  if (piece.kind === "carousel" && piece.slides.length < 2) {
    found.push({ channelId: null, text: "A carousel needs at least two slides" });
  }
  if (piece.slides.some((s) => !s.alt.trim())) {
    found.push({ channelId: null, text: "A slide is missing alt text" });
  }

  const longest = longestBody(piece);
  for (const channel of targets) {
    const rules = RULES[channel.platform];
    if (rules.limit !== null && longest > rules.limit) {
      found.push({
        channelId: channel.id,
        text: `${longest - rules.limit} over ${PLATFORM_LABEL[channel.platform]}'s ${rules.limit}`,
      });
    }
    if (piece.slides.length > rules.maxSlides) {
      found.push({
        channelId: channel.id,
        text: `${PLATFORM_LABEL[channel.platform]} takes ${rules.maxSlides} slides at most`,
      });
    }
    if (!rules.kinds.includes(piece.kind)) {
      found.push({
        channelId: channel.id,
        text: `${PLATFORM_LABEL[channel.platform]} has no ${KIND_LABEL[piece.kind].toLowerCase()}`,
      });
    }
  }
  return found;
}

/** The kinds that carry images. */
export const VISUAL_KINDS: Kind[] = ["carousel", "reel", "image"];

export function makePiece(projectId: string, patch: Partial<Piece> = {}): Piece {
  const now = new Date().toISOString();
  return {
    id: uid("piece"),
    projectId,
    col: "idea",
    kind: "post",
    title: "",
    body: "",
    parts: [],
    slides: [],
    channels: [],
    scheduledFor: null,
    keptScheduledFor: null,
    publishedAt: null,
    metrics: null,
    links: {},
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
