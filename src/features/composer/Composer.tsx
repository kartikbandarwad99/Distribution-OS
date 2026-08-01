import { useEffect, useMemo, useRef, useState } from "react";
import {
  AssetMedia,
  Avatar,
  SectionHead,
  Seg,
  chStyle,
} from "../../components/UI";
import { useConfirm } from "../../components/Dialog";
import { agoLabel, parseStamp, toStamp, untilLabel } from "../../lib/dates";
import { Glyph, Icon } from "../../lib/glyphs";
import {
  KIND_LABEL,
  PLATFORM_LABEL,
  RULES,
  VISUAL_KINDS,
  longestBody,
  problems,
  uid,
  type Kind,
  type Piece,
  type Slide,
} from "../../lib/model";
import { useStore } from "../../lib/store";
import { isTauri } from "../../lib/connect";
import { publishPieceNow, schedulePiece } from "../../lib/publishing";
import { useTargets } from "../../lib/targets";

/*
 * The composer is the only place a piece is written, and it is deliberately
 * one surface rather than a wizard: what you are saying, where it goes, and
 * when it leaves are all visible at once, because changing any one of them
 * changes whether the others are still valid.
 *
 * Every rule a platform will enforce later is enforced here, in view, before
 * the piece can be scheduled — a post that is 40 characters over X's limit
 * should fail at 11pm on a Tuesday while you are looking at it, not silently
 * at 09:00 on Thursday.
 */

const KINDS: Kind[] = [
  "post",
  "thread",
  "carousel",
  "reel",
  "image",
  "note",
];

export function Composer({
  pieceId,
  onClose,
}: {
  pieceId: string;
  onClose: () => void;
}) {
  const store = useStore();
  const confirm = useConfirm();
  const serverTargets = useTargets();
  const piece = store.pieces.find((p) => p.id === pieceId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  /* Only the hosted build can hand a piece to the server. The desktop app
   * keeps its existing behaviour exactly: move the column, fire a reminder. */
  const [sending, setSending] = useState<null | "schedule" | "now">(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pickerOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pickerOpen]);

  /* A composer left open across its own scheduled minute must stop offering a
   * button that would now fail, so `inThePast` below is recomputed on a tick
   * rather than only when the piece changes. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const targets = useMemo(
    () => store.channels.filter((c) => piece?.channels.includes(c.id)),
    [store.channels, piece],
  );

  const found = useMemo(
    () => (piece ? problems(piece, store.channels) : []),
    [piece, store.channels],
  );

  /* Channels the server can actually publish to. A hand-added channel is a
   * reminder, not a destination — it has no account behind it. */
  const connectedTargets = useMemo(
    () => (isTauri ? [] : targets.filter((c) => c.accountId)),
    [targets],
  );

  /** Channels that still end in a reminder rather than a real publish. */
  const reminderOnly = useMemo(
    () =>
      targets.filter(
        (c) => RULES[c.platform].manualOnly && !connectedTargets.includes(c),
      ),
    [targets, connectedTargets],
  );

  /**
   * Schedule and Publish now differ by one call. Both write the piece through
   * to the server first — post, media bytes, one target per account — and both
   * end in the same Durable Object running the same steps.
   *
   * The local column always moves, server or not, so the desktop build and a
   * server hiccup both leave the board in the state the user just asked for.
   */
  async function send(mode: "schedule" | "now") {
    if (!piece) return;
    if (mode === "schedule") store.movePiece(piece.id, "scheduled");

    if (isTauri || !connectedTargets.length) {
      onClose();
      return;
    }

    setSending(mode);
    setSendError(null);
    try {
      if (mode === "schedule") {
        await schedulePiece(piece, store.channels, store.assets);
      } else {
        await publishPieceNow(piece, store.channels, store.assets);
      }
      // Re-read publishing state so the card shows what just happened rather
      // than waiting for the next reload to find out.
      serverTargets?.refresh();
      onClose();
    } catch (caught) {
      setSendError(
        caught instanceof Error ? caught.message : "Could not reach the server.",
      );
    } finally {
      setSending(null);
    }
  }

  if (!piece) return null;

  const patch = (next: Partial<Piece>) => store.updatePiece(piece.id, next);
  const visual = VISUAL_KINDS.includes(piece.kind);

  /* The tightest limit among the chosen channels — the one that actually
     binds. Showing X's 280 while also posting to LinkedIn would be noise. */
  const limit = targets.reduce<number | null>((tightest, channel) => {
    const rule = RULES[channel.platform].limit;
    if (rule === null) return tightest;
    return tightest === null ? rule : Math.min(tightest, rule);
  }, null);

  const used = longestBody(piece);
  const counterClass =
    limit === null
      ? ""
      : used > limit
        ? "over"
        : used > limit * 0.9
          ? "warn"
          : "";

  function setKind(kind: Kind) {
    // Switching into a thread seeds the first part from the body so nothing
    // written so far is thrown away.
    if (kind === "thread" && !piece!.parts.length) {
      patch({
        kind,
        parts: [{ id: uid("part"), body: piece!.body }],
        body: "",
      });
      return;
    }
    if (kind !== "thread" && piece!.parts.length) {
      patch({
        kind,
        body: piece!.body || piece!.parts.map((p) => p.body).join("\n\n"),
        parts: [],
      });
      return;
    }
    patch({ kind });
  }

  function addSlides(assetIds: string[]) {
    const slides: Slide[] = assetIds.map((assetId) => ({
      id: uid("slide"),
      assetId,
      alt: "",
    }));
    patch({ slides: [...piece!.slides, ...slides] });
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...piece!.slides];
    const [moved] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, moved);
    patch({ slides: next });
  }

  const scheduleValue = piece.scheduledFor
    ? piece.scheduledFor.slice(0, 16)
    : "";

  /* A time already past cannot be scheduled: the server refuses it, and before
   * it did, the alarm clamped it to "now" and the post went out instantly. The
   * native picker makes this easy to hit — at 12:19 PM, "12:22 AM" is one
   * arrow-key away, reads as a perfectly ordinary time, and is twelve hours
   * behind you. */
  const scheduledMs = piece.scheduledFor
    ? parseStamp(piece.scheduledFor).getTime()
    : null;
  const inThePast = scheduledMs !== null && scheduledMs < Date.now();

  return (
    <>
      <button className="modal-scrim" aria-label="Close composer" onClick={onClose} />
      <section className="modal" role="dialog" aria-label="Compose">
        <header className="bar">
          <div className="ttl">
            <h1 style={{ fontSize: "var(--f1)" }}>
              {piece.col === "published" ? "Published piece" : "Compose"}
            </h1>
            <div className="sub">
              {KIND_LABEL[piece.kind]}
              {targets.length
                ? ` · ${targets.length} destination${targets.length > 1 ? "s" : ""}`
                : " · no destination yet"}
            </div>
          </div>
          <span className="grow" />
          <button
            className="icobtn bare"
            title="Duplicate"
            aria-label="Duplicate"
            onClick={() => {
              const copy = store.duplicatePiece(piece.id);
              if (copy) onClose();
            }}
          >
            <Icon.copy />
          </button>
          <button
            className="icobtn bare"
            title="Delete"
            aria-label="Delete"
            onClick={async () => {
              const ok = await confirm({
                title: "Delete this piece",
                body: "It leaves the plan, the calendar and the library. This cannot be undone.",
                confirmLabel: "Delete",
                danger: true,
              });
              if (!ok) return;
              store.deletePiece(piece.id);
              onClose();
            }}
          >
            <Icon.trash />
          </button>
          <button className="icobtn bare" aria-label="Close" onClick={onClose}>
            <Icon.close />
          </button>
        </header>

        <div className="composer">
          <div className="composer-main">
            <Seg
              items={KINDS.map((kind) => ({
                id: kind,
                label: KIND_LABEL[kind],
              }))}
              value={piece.kind}
              onChange={setKind}
            />

            {/* Visual pieces are found by name on the wall — a carousel with
                no title reads as "Untitled" everywhere it appears. */}
            {piece.kind !== "note" && (
              <input
                className="titler"
                value={piece.title}
                spellCheck
                placeholder="Title — for your own eyes"
                onChange={(e) => patch({ title: e.target.value })}
              />
            )}

            {piece.kind === "thread" ? (
              <ThreadParts piece={piece} limit={limit} onPatch={patch} />
            ) : (
              <div>
                <textarea
                  className="writer"
                  value={piece.body}
                  autoFocus
                  spellCheck
                  placeholder={
                    piece.kind === "note"
                      ? "What's the idea? No shape needed yet."
                      : "Write the post…"
                  }
                  onChange={(e) => patch({ body: e.target.value })}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <span className="meta">
                    {piece.body.trim() ? "Saved as you type" : "Nothing yet"}
                  </span>
                  <span className="grow" />
                  {/* Without a destination there is no limit to be near, but
                      the count is still worth seeing. */}
                  <span className={`counter ${counterClass}`}>
                    {limit === null ? used : `${used} / ${limit}`}
                  </span>
                </div>
              </div>
            )}

            {visual && (
              <div>
                <SectionHead
                  meta={
                    piece.slides.length
                      ? `${piece.slides.length} slide${piece.slides.length > 1 ? "s" : ""}`
                      : undefined
                  }
                  right={
                    piece.slides.length > 1 ? (
                      <span className="meta">drag to reorder</span>
                    ) : undefined
                  }
                >
                  {piece.kind === "carousel" ? "Slides" : "Media"}
                </SectionHead>

                <div className="slides">
                  {piece.slides.map((slide, index) => {
                    const asset = store.assets.find(
                      (a) => a.id === slide.assetId,
                    );
                    return (
                      <article
                        key={slide.id}
                        className={`slide ${dragOver === index ? "dropbefore" : ""}`}
                        draggable
                        onDragStart={() => (dragFrom.current = index)}
                        onDragEnd={() => {
                          dragFrom.current = null;
                          setDragOver(null);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(index);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragFrom.current !== null) {
                            reorder(dragFrom.current, index);
                          }
                          setDragOver(null);
                        }}
                      >
                        <div className="frame">
                          <AssetMedia asset={asset} tone={index % 9} />
                          <span className="slide-n">{index + 1}</span>
                          <button
                            className="slide-x"
                            aria-label={`Remove slide ${index + 1}`}
                            onClick={() =>
                              patch({
                                slides: piece.slides.filter(
                                  (s) => s.id !== slide.id,
                                ),
                              })
                            }
                          >
                            <Icon.close />
                          </button>
                        </div>
                        <input
                          className={`slide-alt ${slide.alt.trim() ? "" : "missing"}`}
                          value={slide.alt}
                          placeholder="Alt text"
                          onChange={(e) =>
                            patch({
                              slides: piece.slides.map((s) =>
                                s.id === slide.id
                                  ? { ...s, alt: e.target.value }
                                  : s,
                              ),
                            })
                          }
                        />
                      </article>
                    );
                  })}

                  <button
                    className="slide add"
                    onClick={() => setPickerOpen(true)}
                  >
                    <Icon.plus />
                    {piece.slides.length ? "Add" : "Add media"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn ghost"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Icon.image /> Import from disk
                  </button>
                  {importError && (
                    <p className="note" style={{ marginTop: 10 }}>
                      <Icon.warn />
                      <span>{importError}</span>
                    </p>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    hidden
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (!files.length) return;
                      // Same silent-failure trap as the Assets importer: a
                      // browser that refuses to store the bytes must not look
                      // like a picker that did nothing.
                      setImportError(null);
                      try {
                        const made = await store.importFiles(files);
                        addSlides(made.map((a) => a.id));
                      } catch (caught: unknown) {
                        setImportError(
                          caught instanceof Error
                            ? caught.message
                            : "Could not import that file.",
                        );
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <aside className="composer-side">
            <div>
              <SectionHead meta={`${targets.length} picked`}>
                Destinations
              </SectionHead>
              <div className="targets" style={{ marginTop: 8 }}>
                {store.scopedChannels.map((channel) => {
                  const on = piece.channels.includes(channel.id);
                  const rule = RULES[channel.platform];
                  const incompatible = !rule.kinds.includes(piece.kind);
                  return (
                    <button
                      key={channel.id}
                      className={`target ${on ? "on" : ""}`}
                      style={chStyle(channel)}
                      onClick={() =>
                        patch({
                          channels: on
                            ? piece.channels.filter((id) => id !== channel.id)
                            : [...piece.channels, channel.id],
                        })
                      }
                    >
                      <Avatar channel={channel} size="sm" />
                      <span className="ah">{channel.handle}</span>
                      <Glyph platform={channel.platform} />
                      {incompatible && on && (
                        <span className="hchip warn" title="Kind not supported">
                          <Icon.warn />
                        </span>
                      )}
                      <i className="tick">{on && <Icon.check />}</i>
                    </button>
                  );
                })}
                {!store.scopedChannels.length && (
                  <p className="blank-sm">
                    No channels in this project yet.
                  </p>
                )}
              </div>
            </div>

            <div>
              <SectionHead>When</SectionHead>
              <label className="lbl-f" style={{ marginTop: 8 }}>
                Goes out
                <input
                  className="inp mono"
                  type="datetime-local"
                  value={scheduleValue}
                  onChange={(e) =>
                    patch({
                      scheduledFor: e.target.value
                        ? `${e.target.value}:00`
                        : null,
                    })
                  }
                />
              </label>

              {/* The direction of travel, spelled out. "12:22 AM" alone gives
                  you no way to notice it is behind you; "12 hours ago" does. */}
              {piece.scheduledFor && (
                <p
                  className={`meta ${inThePast ? "warn" : ""}`}
                  style={{ marginTop: 6 }}
                >
                  {inThePast ? (
                    <>
                      <Icon.warn /> That time has already passed —{" "}
                      {agoLabel(piece.scheduledFor)}. Pick a later time, or use
                      Publish now.
                    </>
                  ) : (
                    untilLabel(piece.scheduledFor)
                  )}
                </p>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {[
                  { label: "Today 09:00", days: 0, hour: 9 },
                  { label: "Tomorrow 09:00", days: 1, hour: 9 },
                  { label: "Next week", days: 7, hour: 9 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    className="chip"
                    onClick={() => {
                      const when = new Date();
                      when.setDate(when.getDate() + preset.days);
                      when.setHours(preset.hour, 0, 0, 0);
                      patch({ scheduledFor: toStamp(when) });
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
                {piece.scheduledFor && (
                  <button
                    className="chip"
                    title="Remove the time"
                    onClick={() => patch({ scheduledFor: null })}
                  >
                    <Icon.close /> Clear
                  </button>
                )}
              </div>
              {piece.keptScheduledFor && !piece.scheduledFor && (
                <button
                  className="chip"
                  style={{ marginTop: 8 }}
                  onClick={() =>
                    patch({ scheduledFor: piece.keptScheduledFor })
                  }
                >
                  Restore {piece.keptScheduledFor.slice(5, 16).replace("T", " ")}
                </button>
              )}
            </div>

            <div>
              <SectionHead>Stage</SectionHead>
              <select
                className="sel"
                style={{ marginTop: 8, width: "100%" }}
                value={piece.col}
                onChange={(e) =>
                  store.movePiece(piece.id, e.target.value as Piece["col"])
                }
              >
                <option value="idea">Idea</option>
                <option value="drafting">Drafting</option>
                <option value="ready">Ready</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
              </select>
            </div>

            {found.length > 0 && (
              <div>
                <SectionHead>Before it can go</SectionHead>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    marginTop: 8,
                  }}
                >
                  {found.map((problem, index) => (
                    <span className="hchip warn" key={index}>
                      <Icon.warn /> {problem.text}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* A connected account on the hosted build no longer has this
                problem: media is staged in R2 and Meta fetches it from a
                signed URL. The warning is for the channels that really are
                still reminders. */}
            {reminderOnly.length > 0 && (
              <p className="note">
                <Icon.warn />
                <span>
                  {reminderOnly
                    .map((c) => PLATFORM_LABEL[c.platform])
                    .join(" and ")}{" "}
                  needs its image on a public URL — Meta fetches media rather
                  than accepting an upload, and a local file has no such URL. So
                  this piece fires a reminder instead, with the caption copied
                  and the media ready in Finder.
                </span>
              </p>
            )}

            {connectedTargets.length > 0 && (
              <p className="note info">
                <Icon.check />
                <span>
                  Publishing to{" "}
                  <b>{connectedTargets.map((c) => c.handle).join(", ")}</b> is
                  automatic — the media is staged and Instagram fetches it at
                  publish time.
                </span>
              </p>
            )}
          </aside>
        </div>

        <footer className="modal-foot">
          {sendError && (
            <span className="hchip warn" title={sendError}>
              <Icon.warn /> {sendError}
            </span>
          )}
          <span className="meta">
            {piece.scheduledFor
              ? `Goes out ${parseStamp(piece.scheduledFor).toLocaleString([], {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "No time set"}
          </span>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Done
          </button>

          {/* Publishing straight away exists only where there is a server to
              do it. On the desktop build a piece still becomes a reminder. */}
          {!isTauri && connectedTargets.length > 0 && (
            <button
              className="btn"
              disabled={found.length > 0 || sending !== null}
              title={
                found.length ? "Fix what's listed on the right first" : undefined
              }
              onClick={() => void send("now")}
            >
              {sending === "now" ? "Sending…" : "Publish now"}
            </button>
          )}

          <button
            className="btn pri"
            disabled={
              found.length > 0 ||
              !piece.scheduledFor ||
              inThePast ||
              sending !== null
            }
            title={
              found.length
                ? "Fix what's listed on the right first"
                : !piece.scheduledFor
                  ? "Pick a time first"
                  : inThePast
                    ? "That time has already passed — pick a later one, or use Publish now"
                    : undefined
            }
            onClick={() => void send("schedule")}
          >
            {sending === "schedule" ? "Scheduling…" : "Schedule"}
          </button>
        </footer>
      </section>

      {pickerOpen && (
        <AssetPicker
          onClose={() => setPickerOpen(false)}
          onPick={(ids) => {
            addSlides(ids);
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

function ThreadParts({
  piece,
  limit,
  onPatch,
}: {
  piece: Piece;
  limit: number | null;
  onPatch: (patch: Partial<Piece>) => void;
}) {
  const parts = piece.parts.length
    ? piece.parts
    : [{ id: uid("part"), body: "" }];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {parts.map((part, index) => {
        const over = limit !== null && part.body.length > limit;
        return (
          <div className="part" key={part.id}>
            <div className="part-rail">
              <span className="part-n">{index + 1}</span>
              {index < parts.length - 1 && <i className="thread-line" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                className="writer"
                style={{ minHeight: 92 }}
                value={part.body}
                autoFocus={index === 0}
                placeholder={index === 0 ? "The hook…" : "Keep going…"}
                onChange={(e) =>
                  onPatch({
                    parts: parts.map((p) =>
                      p.id === part.id ? { ...p, body: e.target.value } : p,
                    ),
                  })
                }
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                {parts.length > 1 && (
                  <button
                    className="btn ghost"
                    onClick={() =>
                      onPatch({ parts: parts.filter((p) => p.id !== part.id) })
                    }
                  >
                    Remove
                  </button>
                )}
                <span className="grow" />
                {limit !== null && (
                  <span className={`counter ${over ? "over" : ""}`}>
                    {part.body.length} / {limit}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <button
        className="kadd"
        onClick={() =>
          onPatch({ parts: [...parts, { id: uid("part"), body: "" }] })
        }
      >
        <Icon.plus /> Add a part
      </button>
    </div>
  );
}

/** Pick from what's already imported, so the same file is never stored twice. */
function AssetPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (assetIds: string[]) => void;
}) {
  const store = useStore();
  const [picked, setPicked] = useState<string[]>([]);

  return (
    <>
      <button
        className="modal-scrim"
        style={{ zIndex: 62 }}
        aria-label="Close picker"
        onClick={onClose}
      />
      <section className="modal" style={{ zIndex: 63 }} role="dialog" aria-label="Choose media">
        <header className="bar">
          <div className="ttl">
            <h1 style={{ fontSize: "var(--f1)" }}>Choose media</h1>
            <div className="sub">{store.scopedAssets.length} in this project</div>
          </div>
          <span className="grow" />
          <button className="icobtn bare" aria-label="Close" onClick={onClose}>
            <Icon.close />
          </button>
        </header>

        <div className="scroll">
          {store.scopedAssets.length ? (
            <div className="assetgrid">
              {store.scopedAssets.map((asset, index) => {
                const order = picked.indexOf(asset.id);
                return (
                  <button
                    key={asset.id}
                    className="acell"
                    data-pick={order >= 0 ? "1" : undefined}
                    onClick={() =>
                      setPicked((current) =>
                        current.includes(asset.id)
                          ? current.filter((id) => id !== asset.id)
                          : [...current, asset.id],
                      )
                    }
                  >
                    <div className="frame">
                      <AssetMedia asset={asset} tone={index % 9} />
                      {order >= 0 && <span className="pill">{order + 1}</span>}
                    </div>
                    <div className="ameta">
                      <span className="an">{asset.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="blank-sm" style={{ padding: 46 }}>
              Nothing imported yet — use “Import from disk”.
            </p>
          )}
        </div>

        <footer className="modal-foot">
          <span className="meta">{picked.length} chosen · click to order</span>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={!picked.length}
            onClick={() => onPick(picked)}
          >
            Add {picked.length || ""}
          </button>
        </footer>
      </section>
    </>
  );
}
