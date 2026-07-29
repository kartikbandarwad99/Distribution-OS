import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AssetMedia,
  Avatar,
  Blank,
  Seg,
  VideoPlayer,
} from "../../components/UI";
import { shortDate } from "../../lib/dates";
import { Icon } from "../../lib/glyphs";
import {
  COLUMNS,
  KIND_LABEL,
  fmt,
  type Article,
  type Asset,
  type Col,
  type Kind,
  type Piece,
} from "../../lib/model";
import { useStore } from "../../lib/store";

/*
 * Library is everything you have made, at whatever stage it is at — ideas,
 * drafts, things waiting on a time, things scheduled, things that already
 * went out, and the articles beside them.
 *
 * It used to show only `col === "published"`, which meant an app with
 * thirteen pieces in it said "nothing composed yet". The shelf is not the
 * outbox: Plan answers "what is next", Library answers "what do I have".
 * They read the same rows, so their counts cannot drift.
 */

/** Rough visual weight, used to balance the columns without measuring. */
function weight(entry: Entry, aspect: number): number {
  if (entry.type === "article") return 1.05;
  const piece = entry.piece;
  if (piece.kind === "reel") return 1.78;
  if (piece.kind === "carousel") return aspect + 0.15;
  if (piece.kind === "image") return aspect + 0.1;
  return 0.34 + Math.min(1.1, (piece.body || piece.parts[0]?.body || "").length / 150);
}

/* Pieces and articles share the wall, so the wall works on one shape. */
type Entry =
  | { type: "piece"; id: string; at: string; piece: Piece }
  | { type: "article"; id: string; at: string; article: Article };

type Stage = "all" | Col;

const STAGE_TABS: Array<{ id: Stage; label: string }> = [
  { id: "all", label: "Everything" },
  ...COLUMNS.map((c) => ({ id: c.id as Stage, label: c.label })),
];

/** The stamp a piece should be filed under, whatever stage it reached. */
const pieceAt = (p: Piece) =>
  p.publishedAt ?? p.scheduledFor ?? p.updatedAt ?? p.createdAt;

const articleStage = (a: Article): Col =>
  a.status === "published"
    ? "published"
    : a.status === "scheduled"
      ? "scheduled"
      : "drafting";

export function LibraryView({ onOpen }: { onOpen: (id: string) => void }) {
  const store = useStore();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("all");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [sort, setSort] = useState<"recent" | "reach">("recent");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<Asset | null>(null);

  /* Everything in the project, pieces and articles alike. */
  const all = useMemo<Entry[]>(() => {
    const pieces: Entry[] = store.scopedPieces.map((piece) => ({
      type: "piece",
      id: piece.id,
      at: pieceAt(piece),
      piece,
    }));
    const articles: Entry[] = store.scopedArticles.map((article) => ({
      type: "article",
      id: article.id,
      at: article.publishedAt ?? article.updatedAt ?? article.createdAt,
      article,
    }));
    return [...pieces, ...articles];
  }, [store.scopedPieces, store.scopedArticles]);

  const stageOf = (entry: Entry): Col =>
    entry.type === "article" ? articleStage(entry.article) : entry.piece.col;

  const kindOf = (entry: Entry): Kind =>
    entry.type === "article" ? "article" : entry.piece.kind;

  const textOf = (entry: Entry): string =>
    entry.type === "article"
      ? `${entry.article.title} ${entry.article.deck}`
      : `${entry.piece.title} ${entry.piece.body} ${entry.piece.parts
          .map((p) => p.body)
          .join(" ")}`;

  const reachOf = (entry: Entry): number =>
    entry.type === "article"
      ? entry.article.views
      : (entry.piece.metrics?.reach ?? 0);

  const stageCounts = useMemo(() => {
    const map = new Map<Col, number>();
    all.forEach((e) => map.set(stageOf(e), (map.get(stageOf(e)) ?? 0) + 1));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  const inStage = useMemo(
    () => all.filter((e) => stage === "all" || stageOf(e) === stage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, stage],
  );

  const kindCounts = useMemo(() => {
    const map = new Map<Kind, number>();
    inStage.forEach((e) => map.set(kindOf(e), (map.get(kindOf(e)) ?? 0) + 1));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inStage]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inStage
      .filter((e) => kind === "all" || kindOf(e) === kind)
      .filter((e) => !needle || textOf(e).toLowerCase().includes(needle))
      .sort((a, b) =>
        sort === "reach"
          ? reachOf(b) - reachOf(a)
          : (b.at ?? "").localeCompare(a.at ?? ""),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inStage, kind, query, sort]);

  /* Shortest-column packing, so the wall stays level without a layout pass. */
  const columns = useMemo(() => {
    const buckets = Array.from({ length: 4 }, () => ({
      height: 0,
      items: [] as Entry[],
    }));
    for (const entry of shown) {
      const asset =
        entry.type === "piece"
          ? store.assets.find((a) => a.id === entry.piece.slides[0]?.assetId)
          : undefined;
      const aspect = asset && asset.width ? asset.height / asset.width : 1.25;
      const bucket = buckets.reduce((a, b) => (b.height < a.height ? b : a));
      bucket.items.push(entry);
      bucket.height += weight(entry, aspect) + 0.16;
    }
    return buckets;
  }, [shown, store.assets]);

  if (!all.length) {
    return (
      <>
        <header className="bar">
          <div className="ttl">
            <h1>Library</h1>
            <div className="sub">Everything you have made</div>
          </div>
        </header>
        <div className="scroll">
          <Blank
            icon="lib"
            title="Nothing here yet"
            action={
              <button
                className="btn pri"
                onClick={() => onOpen(store.createPiece().id)}
              >
                <Icon.plus /> Write something
              </button>
            }
          >
            Every idea, draft, carousel, reel and article lands on this wall the
            moment it exists — long before it goes anywhere. Nothing to set up.
          </Blank>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="bar">
        <div className="ttl">
          <h1>Library</h1>
          <div className="sub">
            {all.length} in all · {stageCounts.get("published") ?? 0} published
          </div>
        </div>
        <span className="grow" />
        <label className="field sm">
          <Icon.search />
          <input
            value={query}
            placeholder="Filter"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Seg
          items={[
            { id: "recent", label: "Recent" },
            { id: "reach", label: "By reach" },
          ]}
          value={sort}
          onChange={setSort}
        />
        <button
          className="icobtn acc"
          aria-label="New piece"
          title="New piece"
          onClick={() => onOpen(store.createPiece().id)}
        >
          <Icon.plus />
        </button>
      </header>

      <div className="scroll">
        {/* Stage first — "show me the drafts" is the question people arrive
            with. Kind is the second cut, inside whatever stage is showing. */}
        <div className="filters">
          {STAGE_TABS.map((tab) => {
            const count =
              tab.id === "all" ? all.length : (stageCounts.get(tab.id) ?? 0);
            if (!count && tab.id !== "all") return null;
            return (
              <button
                key={tab.id}
                className={`fchip ${stage === tab.id ? "on" : ""}`}
                onClick={() => {
                  setStage(tab.id);
                  setKind("all");
                }}
              >
                {tab.label}
                <span className="c">{count}</span>
              </button>
            );
          })}
        </div>

        {kindCounts.size > 1 && (
          <div className="filters subfilters">
            <button
              className={`fchip ${kind === "all" ? "on" : ""}`}
              onClick={() => setKind("all")}
            >
              All kinds<span className="c">{inStage.length}</span>
            </button>
            {[...kindCounts.entries()].map(([id, count]) => (
              <button
                key={id}
                className={`fchip ${kind === id ? "on" : ""}`}
                onClick={() => setKind(id)}
              >
                {KIND_LABEL[id]}
                <span className="c">{count}</span>
              </button>
            ))}
          </div>
        )}

        {shown.length ? (
          <div className="gal">
            {columns.map((bucket, index) => (
              <div className="galcol" key={index}>
                {bucket.items.map((entry) =>
                  entry.type === "article" ? (
                    <ArticleTile
                      key={entry.id}
                      article={entry.article}
                      onOpen={() => navigate(`/articles/${entry.article.id}`)}
                    />
                  ) : (
                    <Tile
                      key={entry.id}
                      piece={entry.piece}
                      onOpen={onOpen}
                      onPlay={setPlaying}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="blank-sm" style={{ padding: 60 }}>
            Nothing matches that filter.
          </p>
        )}
      </div>

      {playing && (
        <VideoPlayer asset={playing} onClose={() => setPlaying(null)} />
      )}
    </>
  );
}

/** Where a piece is up to, in the same words the plan columns use. */
function StageTag({ col }: { col: Col }) {
  const label = COLUMNS.find((c) => c.id === col)?.label ?? col;
  const tone =
    col === "published"
      ? "published"
      : col === "scheduled"
        ? "scheduled"
        : col === "idea"
          ? "idea"
          : "draft";
  return <span className={`tag ${tone}`}>{label}</span>;
}

function Tile({
  piece,
  onOpen,
  onPlay,
}: {
  piece: Piece;
  onOpen: (id: string) => void;
  onPlay: (asset: Asset) => void;
}) {
  const store = useStore();
  const channel = store.channels.find((c) => c.id === piece.channels[0]);
  const asset = store.assets.find((a) => a.id === piece.slides[0]?.assetId);
  const ratio =
    asset && asset.width && asset.height
      ? `${asset.width}/${asset.height}`
      : "4/5";

  const when =
    piece.publishedAt ?? piece.scheduledFor ?? piece.updatedAt ?? null;

  const caption = (
    <div className="cap">
      {channel ? (
        <>
          <Avatar channel={channel} size="sm" />
          <span className="ch">{channel.handle}</span>
        </>
      ) : (
        <span className="ch" style={{ color: "var(--ink-4)" }}>
          No destination
        </span>
      )}
      <span className="grow" />
      {piece.metrics?.reach ? (
        <span className="cd">{fmt(piece.metrics.reach)}</span>
      ) : (
        <span className="cd">{when ? shortDate(when) : ""}</span>
      )}
    </div>
  );

  const media = (extra?: React.ReactNode) => (
    <div className="frame" style={{ ["--ratio"]: ratio } as React.CSSProperties}>
      <AssetMedia asset={asset} />
      {extra}
    </div>
  );

  const stageTag = (
    <span className="tilestage">
      <StageTag col={piece.col} />
    </span>
  );

  let inner: React.ReactNode;
  if (piece.kind === "reel") {
    inner = media(
      <>
        <span className="scrim" />
        {asset?.type === "video" && (
          <button
            className="playb"
            aria-label={`Play ${asset.name}`}
            title="Play"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(asset);
            }}
          >
            <Icon.play />
          </button>
        )}
        <span className="mt">{piece.title || piece.body}</span>
        {stageTag}
      </>,
    );
  } else if (piece.kind === "carousel") {
    inner = (
      <>
        <span className="edge e2" />
        <span className="edge e1" />
        {media(
          <>
            <span className="pill">{piece.slides.length} slides</span>
            <span className="scrim" />
            <span className="mt">{piece.title || piece.body}</span>
            {stageTag}
          </>,
        )}
      </>
    );
  } else if (piece.kind === "image") {
    inner = media(
      <>
        <span className="scrim" />
        <span className="mt">{piece.title || piece.body}</span>
        {stageTag}
      </>,
    );
  } else if (piece.kind === "note") {
    inner = (
      <div className="txt idea">
        <span className="lab">
          Note
          <StageTag col={piece.col} />
        </span>
        <p>{piece.body || "Empty note"}</p>
      </div>
    );
  } else {
    inner = (
      <div className="txt">
        <span className="lab">
          {piece.kind === "thread"
            ? `${piece.parts.length} parts`
            : KIND_LABEL[piece.kind]}
          <StageTag col={piece.col} />
        </span>
        <p>
          {piece.body ||
            piece.parts[0]?.body ||
            piece.title ||
            "Nothing written yet"}
        </p>
      </div>
    );
  }

  return (
    <article
      className="tile"
      onClick={() => onOpen(piece.id)}
      style={{ cursor: "pointer" }}
    >
      {inner}
      {caption}
    </article>
  );
}

function ArticleTile({
  article,
  onOpen,
}: {
  article: Article;
  onOpen: () => void;
}) {
  const store = useStore();
  const channel = store.channels.find((c) => c.id === article.destinations[0]);
  const done = article.outline.filter((o) => o.done).length;

  return (
    <article className="tile" onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className="artbody">
        <span className="lab">
          Article
          <StageTag col={articleStage(article)} />
        </span>
        <h3>{article.title}</h3>
        {article.deck && <span className="src">{article.deck}</span>}
        {article.outline.length > 0 && (
          <span className="meta" style={{ marginTop: 8, display: "block" }}>
            {done}/{article.outline.length} sections
          </span>
        )}
      </div>
      <div className="cap">
        {channel ? (
          <>
            <Avatar channel={channel} size="sm" />
            <span className="ch">{channel.handle}</span>
          </>
        ) : (
          <span className="ch" style={{ color: "var(--ink-4)" }}>
            No destination
          </span>
        )}
        <span className="grow" />
        <span className="cd">
          {article.views ? fmt(article.views) : shortDate(article.updatedAt)}
        </span>
      </div>
    </article>
  );
}
