import { useMemo, useRef, useState } from "react";
import {
  AssetMedia,
  Blank,
  SectionHead,
  Seg,
  VideoPlayer,
} from "../../components/UI";
import { useConfirm, usePrompt } from "../../components/Dialog";
import { shortDate } from "../../lib/dates";
import { Icon } from "../../lib/glyphs";
import { KIND_LABEL, fmt, type Asset } from "../../lib/model";
import { useStore } from "../../lib/store";

/*
 * One store for every file. An asset is imported once and referenced from
 * anywhere — the same image can carry three carousels — so the inspector's
 * "used in" is the honest answer to "can I delete this?".
 *
 * Selection is a set, not a single id, because the thing you most often want
 * to do with eight images is make one carousel out of them, and treating each
 * file as an island made that impossible.
 */

const bytes = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)} GB`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1e3))} KB`;

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

export function AssetsView({ onOpen }: { onOpen: (id: string) => void }) {
  const store = useStore();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const fileInput = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState("all");
  const [sort, setSort] = useState<"recent" | "unused" | "largest">("recent");
  const [picked, setPicked] = useState<string[]>([]);
  const [playing, setPlaying] = useState<Asset | null>(null);
  const [dropping, setDropping] = useState(false);

  const assets = store.scopedAssets;
  const selected = picked.length === 1
    ? (assets.find((a) => a.id === picked[0]) ?? null)
    : null;

  const folders = useMemo(() => {
    const map = new Map<string, number>();
    assets.forEach((a) => map.set(a.folder, (map.get(a.folder) ?? 0) + 1));
    return [...map.entries()];
  }, [assets]);

  const usageCount = (id: string) => store.assetUsage(id).length;

  const shown = useMemo(() => {
    const list = assets.filter((a) => folder === "all" || a.folder === folder);
    return [...list].sort((a, b) => {
      if (sort === "unused") return usageCount(a.id) - usageCount(b.id);
      if (sort === "largest") return b.bytes - a.bytes;
      return b.createdAt.localeCompare(a.createdAt);
    });
    // usageCount reads store.pieces, which is already a dependency via `store`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, folder, sort, store.pieces]);

  const totalBytes = assets.reduce((sum, a) => sum + a.bytes, 0);
  const unused = assets.filter((a) => !usageCount(a.id)).length;

  /** The chosen files, kept in the order they appear on screen. */
  const pickedAssets = shown.filter((a) => picked.includes(a.id));

  async function importFiles(files: File[]) {
    if (!files.length) return;
    const made = await store.importFiles(
      files,
      folder === "all" ? "Unsorted" : folder,
    );
    setPicked(made.map((a) => a.id));
  }

  /** Range-select with shift, add/remove with the platform modifier. */
  function choose(id: string, event: React.MouseEvent) {
    if (event.shiftKey && picked.length) {
      const order = shown.map((a) => a.id);
      const from = order.indexOf(picked[picked.length - 1]);
      const to = order.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        const span = order.slice(lo, hi + 1);
        setPicked([...new Set([...picked, ...span])]);
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setPicked((current) =>
        current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id],
      );
      return;
    }
    setPicked(picked.length === 1 && picked[0] === id ? [] : [id]);
  }

  return (
    <>
      <header className="bar">
        <div className="ttl">
          <h1>Assets</h1>
          <div className="sub">
            {assets.length
              ? `${assets.length} files · ${unused} unused · ${bytes(totalBytes)}`
              : "One store, used everywhere in the app"}
          </div>
        </div>
        <span className="grow" />
        {assets.length > 0 && (
          <Seg
            items={[
              { id: "recent", label: "Newest" },
              { id: "unused", label: "Unused" },
              { id: "largest", label: "Largest" },
            ]}
            value={sort}
            onChange={setSort}
          />
        )}
        <button
          className="icobtn acc"
          aria-label="Import"
          title="Import"
          onClick={() => fileInput.current?.click()}
        >
          <Icon.plus />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            void importFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </header>

      <div
        className="withrail"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          void importFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div
          className="scroll"
          style={
            dropping
              ? {
                  boxShadow:
                    "inset 0 0 0 2px color-mix(in srgb, var(--rubric) 40%, transparent)",
                }
              : undefined
          }
        >
          {assets.length ? (
            <>
              {folders.length > 1 && (
                <div className="filters">
                  <button
                    className={`fchip ${folder === "all" ? "on" : ""}`}
                    onClick={() => setFolder("all")}
                  >
                    All assets<span className="c">{assets.length}</span>
                  </button>
                  {folders.map(([name, count]) => (
                    <button
                      key={name}
                      className={`fchip ${folder === name ? "on" : ""}`}
                      onClick={() => setFolder(name)}
                    >
                      {name}
                      <span className="c">{count}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="assetgrid">
                {shown.map((asset, index) => {
                  const used = usageCount(asset.id);
                  const order = picked.indexOf(asset.id);
                  return (
                    <article
                      key={asset.id}
                      className="acell"
                      data-pick={order >= 0 ? "1" : undefined}
                      onClick={(e) => choose(asset.id, e)}
                    >
                      <div className="frame">
                        <AssetMedia asset={asset} tone={index % 9} />
                        {asset.type === "video" && (
                          <>
                            <button
                              className="playb"
                              aria-label={`Play ${asset.name}`}
                              title="Play"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlaying(asset);
                              }}
                            >
                              <Icon.play />
                            </button>
                            {asset.duration !== null && (
                              <span className="pill">
                                {clock(asset.duration)}
                              </span>
                            )}
                          </>
                        )}
                        {picked.length > 1 && order >= 0 && (
                          <span className="ordinal">{order + 1}</span>
                        )}
                        {!used && <span className="unused">unused</span>}
                      </div>
                      <div className="ameta">
                        <span className="an" title={asset.name}>
                          {asset.name}
                        </span>
                        <span className="grow" />
                        {used > 0 && <span className="usedin">×{used}</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <Blank
              icon="film"
              title="No media yet"
              action={
                <button
                  className="btn pri"
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon.plus /> Import files
                </button>
              }
            >
              Drop images and video anywhere on this page, or import them. Files
              live here once and every carousel, reel and post references them —
              so nothing is ever stored twice.
            </Blank>
          )}
        </div>

        <aside className="rail">
          <header className="bar" style={{ padding: "0 15px" }}>
            <b className="railtitle" title={selected?.name}>
              {selected
                ? selected.name
                : picked.length
                  ? `${picked.length} selected`
                  : "Inspector"}
            </b>
            <span className="grow" />
            {picked.length > 0 && (
              <button
                className="icobtn bare"
                aria-label={
                  picked.length > 1
                    ? `Delete ${picked.length} assets`
                    : "Delete asset"
                }
                title="Delete"
                onClick={async () => {
                  const uses = picked.reduce(
                    (sum, id) => sum + store.assetUsage(id).length,
                    0,
                  );
                  const what =
                    picked.length > 1
                      ? `these ${picked.length} files`
                      : `“${selected?.name}”`;
                  const ok = await confirm({
                    title: picked.length > 1 ? "Delete files" : "Delete file",
                    body: uses
                      ? `${what} appear in ${uses} piece${uses > 1 ? "s" : ""} and will be removed from ${uses > 1 ? "them" : "it"}.`
                      : `Delete ${what}? Nothing references ${picked.length > 1 ? "them" : "it"}.`,
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  if (!ok) return;
                  picked.forEach((id) => store.deleteAsset(id));
                  setPicked([]);
                }}
              >
                <Icon.trash />
              </button>
            )}
          </header>

          <div className="railbody">
            {picked.length > 1 ? (
              <BulkPanel
                assets={pickedAssets}
                onOpen={onOpen}
                onClear={() => setPicked([])}
              />
            ) : selected ? (
              <>
                <div
                  className="frame ihero"
                  style={
                    {
                      ["--ratio"]:
                        selected.width && selected.height
                          ? `${selected.width}/${selected.height}`
                          : "4/5",
                    } as React.CSSProperties
                  }
                >
                  <AssetMedia asset={selected} />
                  {selected.type === "video" && (
                    <button
                      className="playb"
                      aria-label={`Play ${selected.name}`}
                      title="Play"
                      onClick={() => setPlaying(selected)}
                    >
                      <Icon.play />
                    </button>
                  )}
                </div>

                <label className="lbl-f">
                  Name
                  <input
                    className="inp"
                    value={selected.name}
                    onChange={(e) =>
                      store.updateAsset(selected.id, { name: e.target.value })
                    }
                  />
                </label>

                <label className="lbl-f">
                  Folder
                  <input
                    className="inp"
                    value={selected.folder}
                    onChange={(e) =>
                      store.updateAsset(selected.id, { folder: e.target.value })
                    }
                  />
                </label>

                <dl className="kv">
                  <dt>Kind</dt>
                  <dd>{selected.type === "video" ? "Video" : "Image"}</dd>
                  <dt>Size</dt>
                  <dd className="mono">
                    {selected.width}×{selected.height}
                  </dd>
                  {selected.duration !== null && (
                    <>
                      <dt>Length</dt>
                      <dd className="mono">{clock(selected.duration)}</dd>
                    </>
                  )}
                  <dt>Weight</dt>
                  <dd className="mono">{bytes(selected.bytes)}</dd>
                  <dt>Added</dt>
                  <dd>{shortDate(selected.createdAt.slice(0, 10))}</dd>
                </dl>

                <SectionHead style={{ marginTop: 12 }}>Used in</SectionHead>
                {store.assetUsage(selected.id).map((piece) => (
                  <button
                    key={piece.id}
                    className="usedrow"
                    onClick={() => onOpen(piece.id)}
                  >
                    <span className="k">{KIND_LABEL[piece.kind]}</span>
                    <span className="ub">
                      {piece.body.trim() || piece.title || "Untitled"}
                    </span>
                    <span className="meta">
                      {piece.metrics ? fmt(piece.metrics.reach) : "—"}
                    </span>
                  </button>
                ))}
                {!store.assetUsage(selected.id).length && (
                  <p className="anote">
                    Not used anywhere yet. Nothing breaks if you delete it.
                  </p>
                )}

                <SectionHead style={{ marginTop: 12 }}>Tags</SectionHead>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selected.tags.map((tag) => (
                    <button
                      key={tag}
                      className="chip"
                      title="Remove tag"
                      onClick={() =>
                        store.updateAsset(selected.id, {
                          tags: selected.tags.filter((t) => t !== tag),
                        })
                      }
                    >
                      {tag}
                      <Icon.close />
                    </button>
                  ))}
                  <button
                    className="chip"
                    onClick={async () => {
                      const tag = (
                        await prompt({
                          title: "Add a tag",
                          label: "Tag",
                          placeholder: "launch, b-roll, testimonial…",
                        })
                      )?.trim();
                      if (!tag || selected.tags.includes(tag)) return;
                      store.updateAsset(selected.id, {
                        tags: [...selected.tags, tag],
                      });
                    }}
                  >
                    <Icon.plus />
                  </button>
                </div>

                <button
                  className="btn pri"
                  style={{ justifyContent: "center", marginTop: 14 }}
                  onClick={() => {
                    const piece = store.createPiece({
                      kind: selected.type === "video" ? "reel" : "image",
                      slides: [
                        {
                          id: `slide-${selected.id}`,
                          assetId: selected.id,
                          alt: "",
                        },
                      ],
                    });
                    onOpen(piece.id);
                  }}
                >
                  <Icon.plus /> Make a post from this
                </button>
              </>
            ) : (
              <p className="blank-sm">
                Pick a file to see where it is used and what it earned. Hold ⌘
                or shift to choose several and build a carousel from them.
              </p>
            )}
          </div>
        </aside>
      </div>

      {playing && (
        <VideoPlayer asset={playing} onClose={() => setPlaying(null)} />
      )}
    </>
  );
}

/**
 * What you can do with a handful of files at once. A carousel is the whole
 * reason multi-select exists: picking eight images and getting eight separate
 * image posts was never what anyone meant.
 */
function BulkPanel({
  assets,
  onOpen,
  onClear,
}: {
  assets: Asset[];
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  const store = useStore();
  const prompt = usePrompt();
  const images = assets.filter((a) => a.type === "image");
  const videos = assets.filter((a) => a.type === "video");
  const weight = assets.reduce((sum, a) => sum + a.bytes, 0);

  const slidesFrom = (list: Asset[]) =>
    list.map((asset) => ({
      id: `slide-${asset.id}-${Math.random().toString(36).slice(2, 7)}`,
      assetId: asset.id,
      alt: "",
    }));

  return (
    <>
      <div className="bulkstack">
        {assets.slice(0, 5).map((asset, index) => (
          <span className="bulkchip" key={asset.id} style={{ zIndex: 5 - index }}>
            <AssetMedia asset={asset} tone={index % 9} />
          </span>
        ))}
        {assets.length > 5 && (
          <span className="bulkmore">+{assets.length - 5}</span>
        )}
      </div>

      <dl className="kv">
        <dt>Chosen</dt>
        <dd className="mono">{assets.length}</dd>
        <dt>Images</dt>
        <dd className="mono">{images.length}</dd>
        <dt>Video</dt>
        <dd className="mono">{videos.length}</dd>
        <dt>Weight</dt>
        <dd className="mono">{bytes(weight)}</dd>
      </dl>

      <SectionHead style={{ marginTop: 12 }}>Make something</SectionHead>

      <button
        className="btn pri"
        style={{ justifyContent: "center" }}
        disabled={images.length < 2}
        title={
          images.length < 2
            ? "A carousel needs at least two images"
            : undefined
        }
        onClick={() => {
          const piece = store.createPiece({
            kind: "carousel",
            slides: slidesFrom(images),
          });
          onOpen(piece.id);
        }}
      >
        <Icon.layers /> One carousel · {images.length} slide
        {images.length === 1 ? "" : "s"}
      </button>

      <button
        className="btn"
        style={{ justifyContent: "center" }}
        onClick={() => {
          const first = store.createPiece({
            kind: assets[0].type === "video" ? "reel" : "image",
            slides: slidesFrom([assets[0]]),
          });
          assets.slice(1).forEach((asset) =>
            store.createPiece({
              kind: asset.type === "video" ? "reel" : "image",
              slides: slidesFrom([asset]),
            }),
          );
          onOpen(first.id);
        }}
      >
        <Icon.grid /> Separate posts · {assets.length}
      </button>

      <SectionHead style={{ marginTop: 12 }}>Organise</SectionHead>

      <button
        className="btn"
        style={{ justifyContent: "center" }}
        onClick={async () => {
          const name = (
            await prompt({
              title: `Move ${assets.length} files`,
              label: "Folder",
              placeholder: "Launch week",
              value: assets[0].folder,
            })
          )?.trim();
          if (!name) return;
          assets.forEach((a) => store.updateAsset(a.id, { folder: name }));
        }}
      >
        <Icon.film /> Move to a folder…
      </button>

      <button className="btn ghost" style={{ justifyContent: "center" }} onClick={onClear}>
        Clear selection
      </button>
    </>
  );
}
