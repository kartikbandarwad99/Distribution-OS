import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { forgetAsset, getBlob, makePoster, probe, putBlob } from "./blobStore";
import { parseIso, toStamp } from "./dates";
import {
  deriveTint,
  makePiece,
  uid,
  type Article,
  type Asset,
  type Channel,
  type Col,
  type Kind,
  type Metrics,
  type Piece,
  type Platform,
  type Project,
  type Settings,
  type StoreData,
} from "./model";

const STORAGE_KEY = "distribution-os:workspace";
const VERSION = 2;

/**
 * A fresh install has one project and nothing else. No demo channels, no
 * invented posts, no fixture counts. An empty app that says it is empty is
 * more useful than a full one that is lying.
 */
export function emptyWorkspace(): StoreData {
  const now = new Date().toISOString();
  return {
    version: VERSION,
    projects: [{ id: "personal", name: "Personal", mark: "P", createdAt: now }],
    channels: [],
    pieces: [],
    articles: [],
    assets: [],
    settings: {
      activeProjectId: "personal",
      reminderMinutes: 15,
      publishing: {},
      credentials: {},
    },
  };
}

function hydrate(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw) as StoreData;
    if (parsed.version !== VERSION) return emptyWorkspace();
    const base = emptyWorkspace();
    // Tolerate a payload written by an older build of the same version.
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...parsed.settings },
    };
  } catch {
    return emptyWorkspace();
  }
}

interface StoreValue extends StoreData {
  /* scope */
  project: Project;
  /** Channels visible in the active project: its own, plus the global ones. */
  scopedChannels: Channel[];
  scopedPieces: Piece[];
  scopedArticles: Article[];
  scopedAssets: Asset[];
  counts: { plan: number; library: number; articles: number; assets: number };

  /* pieces */
  createPiece: (patch?: Partial<Piece>) => Piece;
  updatePiece: (id: string, patch: Partial<Piece>) => void;
  deletePiece: (id: string) => void;
  movePiece: (id: string, col: Col) => void;
  reschedulePiece: (id: string, stamp: string) => void;
  duplicatePiece: (id: string) => Piece | null;
  markPublished: (id: string, metrics?: Metrics) => void;
  /** Server target state → local board. Piece id → published_at (ISO). */
  reconcilePublished: (published: Map<string, string>) => void;

  /* articles */
  createArticle: (patch?: Partial<Article>) => Article;
  updateArticle: (id: string, patch: Partial<Article>) => void;
  duplicateArticle: (id: string) => Article | null;
  deleteArticle: (id: string) => void;

  /* assets */
  importFiles: (files: File[], folder?: string) => Promise<Asset[]>;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  /** Which pieces reference this asset — the "used in" number. */
  assetUsage: (id: string) => Piece[];

  /* channels */
  addChannel: (input: {
    platform: Platform;
    handle: string;
    name?: string;
    project?: string | null;
  }) => Channel;
  updateChannel: (id: string, patch: Partial<Channel>) => void;
  deleteChannel: (id: string) => void;

  /* projects & settings */
  createProject: (name: string) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  /* whole-workspace */
  replaceAll: (data: StoreData) => void;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData>(hydrate);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Quota is only reachable if bytes ever leak into the JSON; assets
        // live in IndexedDB precisely so that cannot happen.
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [data]);

  /*
   * Videos imported before posters existed have bytes but no still frame, and
   * would stay grey boxes forever. Decode them once, in the background, then
   * mark them so this never runs for the same asset twice.
   */
  const backfilled = useRef(new Set<string>());
  useEffect(() => {
    const pending = data.assets.filter(
      (a) =>
        a.type === "video" &&
        a.hasBlob &&
        !a.hasPoster &&
        !backfilled.current.has(a.id),
    );
    if (!pending.length) return;

    // Deliberately not cancelled on cleanup. The work is idempotent and the
    // `backfilled` set already stops it repeating; aborting it mid-flight (as
    // StrictMode's double-invoke does) would mark an asset as attempted and
    // then throw away the result, leaving it grey until the next launch.
    void (async () => {
      for (const asset of pending) {
        backfilled.current.add(asset.id);
        const blob = await getBlob(asset.id);
        if (!blob) continue;
        if (!(await makePoster(asset.id, blob))) continue;
        setData((current) => ({
          ...current,
          assets: current.assets.map((a) =>
            a.id === asset.id ? { ...a, hasPoster: true } : a,
          ),
        }));
      }
    })();
  }, [data.assets]);

  const activeProjectId = data.settings.activeProjectId;

  const project = useMemo(
    () =>
      data.projects.find((p) => p.id === activeProjectId) ?? data.projects[0],
    [data.projects, activeProjectId],
  );

  const scopedChannels = useMemo(
    () =>
      data.channels.filter(
        (c) => c.project === null || c.project === activeProjectId,
      ),
    [data.channels, activeProjectId],
  );

  const scopedPieces = useMemo(
    () => data.pieces.filter((p) => p.projectId === activeProjectId),
    [data.pieces, activeProjectId],
  );

  const scopedArticles = useMemo(
    () => data.articles.filter((a) => a.projectId === activeProjectId),
    [data.articles, activeProjectId],
  );

  const scopedAssets = useMemo(
    () => data.assets.filter((a) => a.projectId === activeProjectId),
    [data.assets, activeProjectId],
  );

  /* Every number in the chrome comes from here. None is written by hand. */
  const counts = useMemo(
    () => ({
      plan: scopedPieces.filter((p) => p.col !== "published").length,
      // Library holds everything, at every stage, so its badge counts
      // everything — a shelf, not an outbox.
      library: scopedPieces.length + scopedArticles.length,
      articles: scopedArticles.length,
      assets: scopedAssets.length,
    }),
    [scopedPieces, scopedArticles, scopedAssets],
  );

  /* ── pieces ───────────────────────────────────────────────────────────── */

  const createPiece = useCallback(
    (patch: Partial<Piece> = {}) => {
      const piece = makePiece(activeProjectId, {
        order: Date.now(),
        ...patch,
        col: patch.col ?? (patch.scheduledFor ? "scheduled" : "drafting"),
      });
      setData((current) => ({ ...current, pieces: [...current.pieces, piece] }));
      return piece;
    },
    [activeProjectId],
  );

  const updatePiece = useCallback((id: string, patch: Partial<Piece>) => {
    setData((current) => ({
      ...current,
      pieces: current.pieces.map((p) =>
        p.id === id
          ? { ...p, ...patch, updatedAt: new Date().toISOString() }
          : p,
      ),
    }));
  }, []);

  /**
   * Dragging a scheduled piece back to Drafting must not silently destroy the
   * time you chose. It moves to `keptScheduledFor` and is offered back if the
   * piece returns to Scheduled.
   */
  const movePiece = useCallback((id: string, col: Col) => {
    setData((current) => ({
      ...current,
      pieces: current.pieces.map((p) => {
        if (p.id !== id) return p;
        const leaving = p.col === "scheduled" && col !== "scheduled";
        const returning = col === "scheduled" && !p.scheduledFor;
        return {
          ...p,
          col,
          scheduledFor: leaving
            ? null
            : returning
              ? p.keptScheduledFor
              : p.scheduledFor,
          keptScheduledFor: leaving ? p.scheduledFor : p.keptScheduledFor,
          publishedAt:
            col === "published" ? (p.publishedAt ?? toStamp(new Date())) : null,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }, []);

  const reschedulePiece = useCallback(
    (id: string, stamp: string) =>
      updatePiece(id, { scheduledFor: stamp, col: "scheduled" }),
    [updatePiece],
  );

  const duplicatePiece = useCallback(
    (id: string) => {
      const source = data.pieces.find((p) => p.id === id);
      if (!source) return null;
      const now = new Date().toISOString();
      const copy = makePiece(source.projectId, {
        ...source,
        id: uid("piece"),
        col: "drafting",
        scheduledFor: null,
        keptScheduledFor: null,
        publishedAt: null,
        metrics: null,
        links: {},
        parts: source.parts.map((part) => ({ ...part, id: uid("part") })),
        slides: source.slides.map((slide) => ({ ...slide, id: uid("slide") })),
        order: Date.now(),
        createdAt: now,
        updatedAt: now,
      });
      setData((current) => ({ ...current, pieces: [...current.pieces, copy] }));
      return copy;
    },
    [data.pieces],
  );

  const markPublished = useCallback(
    (id: string, metrics?: Metrics) =>
      updatePiece(id, {
        col: "published",
        publishedAt: toStamp(new Date()),
        ...(metrics ? { metrics } : {}),
      }),
    [updatePiece],
  );

  /**
   * Folds what the server knows about publishing back into the board.
   *
   * This is the return leg the write-through in lib/publishing.ts never had:
   * the app pushed posts to the server and then never asked what became of
   * them, which is why a piece that had been on Instagram for hours still sat
   * in the Scheduled column — and why the analytics page, which filters on
   * `col === "published"`, stayed empty no matter how many metrics were
   * fetched.
   *
   * Two rules keep it safe against a stale or partial read:
   *
   *   - It only ever moves a piece FORWARD, into published. A piece the server
   *     has no opinion about is left exactly as it is, so a target that has
   *     not synced yet cannot yank a card backwards out of Scheduled.
   *   - `publishedAt` comes from the server's timestamp, not this machine's
   *     clock, because the server is the one that watched it happen.
   *
   * Writing to setData once for the whole batch rather than calling
   * markPublished per piece is deliberate: the reconcile runs on every load,
   * and per-piece writes would be one localStorage serialisation each.
   */
  const reconcilePublished = useCallback(
    (published: Map<string, string>) => {
      if (!published.size) return;
      setData((current) => {
        let changed = false;
        const pieces = current.pieces.map((p) => {
          const at = published.get(p.id);
          if (!at || p.col === "published") return p;
          changed = true;
          return {
            ...p,
            col: "published" as Col,
            publishedAt: toStamp(parseIso(at)),
            updatedAt: new Date().toISOString(),
          };
        });
        // Bailing out unchanged keeps this from writing to localStorage —
        // and re-rendering every view — on the reloads where nothing moved.
        return changed ? { ...current, pieces } : current;
      });
    },
    [],
  );

  /* ── assets ───────────────────────────────────────────────────────────── */

  const importFiles = useCallback(
    async (files: File[], folder = "Unsorted") => {
      const made: Asset[] = [];
      for (const file of files) {
        const id = uid("asset");
        const size = await probe(file);
        await putBlob(id, file);
        const isVideo = file.type.startsWith("video");
        // Decode the still now, once, while we already have the bytes in hand.
        const hasPoster = isVideo ? await makePoster(id, file) : false;
        made.push({
          id,
          projectId: activeProjectId,
          name: file.name.replace(/\.[^.]+$/, ""),
          type: isVideo ? "video" : "image",
          hasBlob: true,
          hasPoster,
          src: null,
          width: size.width,
          height: size.height,
          bytes: file.size,
          duration: size.duration,
          folder,
          tags: [],
          createdAt: new Date().toISOString(),
        });
      }
      setData((current) => ({
        ...current,
        assets: [...current.assets, ...made],
      }));
      return made;
    },
    [activeProjectId],
  );

  /* ── channels ─────────────────────────────────────────────────────────── */

  const addChannel = useCallback(
    (input: {
      platform: Platform;
      handle: string;
      name?: string;
      project?: string | null;
    }) => {
      const onPlatform = data.channels.filter(
        (c) => c.platform === input.platform,
      ).length;
      const handle = input.handle.trim();
      const channel: Channel = {
        id: uid("ch"),
        platform: input.platform,
        handle,
        name: (input.name || handle.replace(/^@/, "")).trim(),
        project: input.project === undefined ? activeProjectId : input.project,
        tint: deriveTint(input.platform, onPlatform),
        connection: "manual",
        auth: null,
        followers: 0,
        cadence: { target: 3, actual: 0 },
        createdAt: new Date().toISOString(),
      };
      setData((current) => ({
        ...current,
        channels: [...current.channels, channel],
      }));
      return channel;
    },
    [data.channels, activeProjectId],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...data,
      project,
      scopedChannels,
      scopedPieces,
      scopedArticles,
      scopedAssets,
      counts,

      createPiece,
      updatePiece,
      deletePiece: (id) =>
        setData((current) => ({
          ...current,
          pieces: current.pieces.filter((p) => p.id !== id),
        })),
      movePiece,
      reschedulePiece,
      duplicatePiece,
      markPublished,
      reconcilePublished,

      createArticle: (patch = {}) => {
        const now = new Date().toISOString();
        const article: Article = {
          id: uid("art"),
          projectId: activeProjectId,
          title: "Untitled",
          deck: "",
          body: "",
          status: "draft",
          destinations: [],
          outline: [],
          scheduledFor: null,
          publishedAt: null,
          views: 0,
          reads: 0,
          claps: 0,
          createdAt: now,
          updatedAt: now,
          ...patch,
        };
        setData((current) => ({
          ...current,
          articles: [...current.articles, article],
        }));
        return article;
      },
      updateArticle: (id, patch) =>
        setData((current) => ({
          ...current,
          articles: current.articles.map((a) =>
            a.id === id
              ? { ...a, ...patch, updatedAt: new Date().toISOString() }
              : a,
          ),
        })),
      duplicateArticle: (id) => {
        const source = data.articles.find((a) => a.id === id);
        if (!source) return null;
        const copy: Article = {
          ...source,
          id: uid("art"),
          title: `${source.title} — copy`,
          status: "draft",
          scheduledFor: null,
          publishedAt: null,
          views: 0,
          reads: 0,
          claps: 0,
          updatedAt: new Date().toISOString(),
        };
        setData((current) => ({
          ...current,
          articles: [...current.articles, copy],
        }));
        return copy;
      },
      deleteArticle: (id) =>
        setData((current) => ({
          ...current,
          articles: current.articles.filter((a) => a.id !== id),
        })),

      importFiles,
      updateAsset: (id, patch) =>
        setData((current) => ({
          ...current,
          assets: current.assets.map((a) =>
            a.id === id ? { ...a, ...patch } : a,
          ),
        })),
      deleteAsset: (id) => {
        forgetAsset(id);
        setData((current) => ({
          ...current,
          assets: current.assets.filter((a) => a.id !== id),
          // A deleted file must not leave a hole in a carousel.
          pieces: current.pieces.map((p) =>
            p.slides.some((s) => s.assetId === id)
              ? { ...p, slides: p.slides.filter((s) => s.assetId !== id) }
              : p,
          ),
        }));
      },
      assetUsage: (id) =>
        data.pieces.filter((p) => p.slides.some((s) => s.assetId === id)),

      addChannel,
      updateChannel: (id, patch) =>
        setData((current) => ({
          ...current,
          channels: current.channels.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        })),
      deleteChannel: (id) =>
        setData((current) => ({
          ...current,
          channels: current.channels.filter((c) => c.id !== id),
          pieces: current.pieces.map((p) =>
            p.channels.includes(id)
              ? { ...p, channels: p.channels.filter((c) => c !== id) }
              : p,
          ),
        })),

      createProject: (name) => {
        const made: Project = {
          id: uid("proj"),
          name,
          mark: name.trim()[0]?.toUpperCase() ?? "P",
          createdAt: new Date().toISOString(),
        };
        setData((current) => ({
          ...current,
          projects: [...current.projects, made],
          settings: { ...current.settings, activeProjectId: made.id },
        }));
        return made;
      },
      updateProject: (id, patch) =>
        setData((current) => ({
          ...current,
          projects: current.projects.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        })),
      deleteProject: (id) =>
        setData((current) => {
          const projects = current.projects.filter((p) => p.id !== id);
          if (!projects.length) return current;
          return {
            ...current,
            projects,
            pieces: current.pieces.filter((p) => p.projectId !== id),
            articles: current.articles.filter((a) => a.projectId !== id),
            settings: {
              ...current.settings,
              activeProjectId:
                current.settings.activeProjectId === id
                  ? projects[0].id
                  : current.settings.activeProjectId,
            },
          };
        }),
      updateSettings: (patch) =>
        setData((current) => ({
          ...current,
          settings: { ...current.settings, ...patch },
        })),

      replaceAll: setData,
      resetAll: () => {
        data.assets.forEach((a) => forgetAsset(a.id));
        setData(emptyWorkspace());
      },
    }),
    [
      data,
      project,
      scopedChannels,
      scopedPieces,
      scopedArticles,
      scopedAssets,
      counts,
      createPiece,
      updatePiece,
      movePiece,
      reschedulePiece,
      duplicatePiece,
      markPublished,
      reconcilePublished,
      importFiles,
      addChannel,
      activeProjectId,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}

/** Resolve a channel id against the whole roster, not just the active scope. */
export function useChannel(id: string | null | undefined): Channel | undefined {
  const store = useStore();
  return id ? store.channels.find((c) => c.id === id) : undefined;
}

export type { Piece, Channel, Asset, Article, Kind, Col };
