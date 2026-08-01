import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AssetMedia,
  Avatar,
  Blank,
  ChannelLegend,
  FilterRail,
  Seg,
  chStyle,
  passes,
} from "../../components/UI";
import {
  addDays,
  dateKey,
  formatTime,
  monthMatrix,
  parseStamp,
  toStamp,
} from "../../lib/dates";
import { Glyph, Icon } from "../../lib/glyphs";
import { COLUMNS, KIND_LABEL, fmt, type Col, type Piece } from "../../lib/model";
import { useStore } from "../../lib/store";
import { usePieceStatus } from "../../lib/targets";

/*
 * Plan answers one question — when does it go out — in two shapes over the
 * same rows. Kanban is for pieces that do not have a time yet; the calendar is
 * for the ones that do. The toggle is top-right, not two routes, because they
 * are the same work seen from two sides.
 */

export function PlanView({ onOpen }: { onOpen: (id: string) => void }) {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "calendar" ? "calendar" : "kanban";
  const [filter, setFilter] = useState("all");

  const visible = useMemo(() => {
    if (filter === "all") return store.scopedPieces;
    return store.scopedPieces.filter((piece) =>
      piece.channels.some((id) => {
        const channel = store.channels.find((c) => c.id === id);
        return channel ? passes(channel, filter) : false;
      }),
    );
  }, [store.scopedPieces, store.channels, filter]);

  const scheduled = visible.filter((p) => p.col === "scheduled").length;
  const working = visible.filter(
    (p) => p.col !== "published" && p.col !== "scheduled",
  ).length;

  function newPiece(patch: Partial<Piece> = {}) {
    const piece = store.createPiece(patch);
    onOpen(piece.id);
  }

  return (
    <>
      <header className="bar">
        <div className="ttl">
          <h1>Plan</h1>
          <div className="sub">
            {visible.length
              ? `${scheduled} scheduled · ${working} in progress`
              : "Nothing planned yet"}
          </div>
        </div>
        <span className="grow" />
        <Seg
          items={[
            {
              id: "kanban",
              label: (
                <>
                  <Icon.grid /> Kanban
                </>
              ),
            },
            {
              id: "calendar",
              label: (
                <>
                  <Icon.cal /> Calendar
                </>
              ),
            },
          ]}
          value={view}
          onChange={(next) => setParams({ view: next })}
        />
        <button className="btn pri" onClick={() => newPiece()}>
          <Icon.plus /> New
        </button>
      </header>

      <div className="scroll">
        <FilterRail value={filter} onChange={setFilter} />
        {view === "kanban" ? (
          <Kanban pieces={visible} onOpen={onOpen} onNew={newPiece} />
        ) : (
          <Calendar pieces={visible} filter={filter} onOpen={onOpen} onNew={newPiece} />
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   KANBAN
   ═══════════════════════════════════════════════════════════════════════════ */

function Kanban({
  pieces,
  onOpen,
  onNew,
}: {
  pieces: Piece[];
  onOpen: (id: string) => void;
  onNew: (patch?: Partial<Piece>) => void;
}) {
  const store = useStore();
  const [over, setOver] = useState<Col | null>(null);

  if (!pieces.length) {
    return (
      <>
        <Blank
          title="Nothing in the plan"
          action={
            <button className="btn pri" onClick={() => onNew()}>
              <Icon.plus /> Write the first piece
            </button>
          }
        >
          Ideas arrive on the left and leave on the right. Drag a card between
          columns to move it along; a piece only reaches Scheduled once it has a
          channel and a time.
        </Blank>
      </>
    );
  }

  return (
    <>
      <div className="kan">
        {COLUMNS.map((column) => {
          const items = pieces
            .filter((p) => p.col === column.id)
            .sort((a, b) => a.order - b.order);
          return (
            <section
              key={column.id}
              className={`kcol ${over === column.id ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(column.id);
              }}
              onDragLeave={() => setOver((c) => (c === column.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/piece");
                if (id) store.movePiece(id, column.id);
              }}
            >
              <header className="kcolh">
                <b>{column.label}</b>
                <span className="c">{items.length}</span>
                <em>{column.note}</em>
              </header>
              {items.map((piece) => (
                <KanbanCard key={piece.id} piece={piece} onOpen={onOpen} />
              ))}
              {!items.length && (
                <p className="meta" style={{ padding: "6px 4px" }}>
                  Nothing here.
                </p>
              )}
              <button className="kadd" onClick={() => onNew({ col: column.id })}>
                <Icon.plus /> Add
              </button>
            </section>
          );
        })}
      </div>
      <ChannelLegend />
    </>
  );
}

function KanbanCard({
  piece,
  onOpen,
}: {
  piece: Piece;
  onOpen: (id: string) => void;
}) {
  const store = useStore();
  const channel = store.channels.find((c) => c.id === piece.channels[0]);
  const extra = piece.channels.length - 1;
  const [dragging, setDragging] = useState(false);
  /* What the server says actually happened to this piece, as opposed to what
     the board was told to show when Schedule was pressed. Null on the desktop
     build and for pieces the server has never heard of. */
  const status = usePieceStatus(piece.id);

  const when = piece.scheduledFor
    ? parseStamp(piece.scheduledFor).toLocaleString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const blocker =
    !piece.channels.length
      ? "No channel"
      : piece.col === "ready" && !piece.scheduledFor
        ? "No time set"
        : piece.kind === "carousel" && piece.slides.length < 2
          ? "Needs slides"
          : null;

  const preview =
    piece.body.trim() ||
    piece.parts.find((p) => p.body.trim())?.body ||
    piece.title ||
    "Untitled";

  return (
    <article
      className={`kcard ${dragging ? "dragging" : ""}`}
      style={chStyle(channel)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/piece", piece.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onOpen(piece.id)}
    >
      <div className="ktop">
        {channel ? (
          <>
            <Avatar channel={channel} size="sm" />
            <span className="kh">
              {channel.handle}
              {extra > 0 ? ` +${extra}` : ""}
            </span>
          </>
        ) : (
          <span className="kh" style={{ color: "var(--ink-4)" }}>
            Unassigned
          </span>
        )}
        <span className="grow" />
        <span className="k">
          {KIND_LABEL[piece.kind]}
          {piece.kind === "thread" && piece.parts.length
            ? ` · ${piece.parts.length}`
            : ""}
          {piece.kind === "carousel" && piece.slides.length
            ? ` · ${piece.slides.length}`
            : ""}
        </span>
      </div>

      <div className="kbody">{preview}</div>

      {/* The real frames, not a grey stand-in — a card should show what is
          actually attached to it. */}
      {piece.slides.length > 0 && (
        <div className="kstrip">
          {piece.slides.slice(0, 3).map((slide, index) => (
            <i key={slide.id}>
              <AssetMedia
                asset={store.assets.find((a) => a.id === slide.assetId)}
                tone={index % 9}
              />
            </i>
          ))}
          {piece.slides.length > 3 && (
            <em className="kstrip-more">+{piece.slides.length - 3}</em>
          )}
        </div>
      )}

      <div className="kfoot">
        <span className={`kwhen ${piece.col === "published" ? "dim" : ""}`}>
          {when ?? (piece.publishedAt ? formatTime(piece.publishedAt) : "—")}
        </span>
        <span className="grow" />
        {/* Server truth first. A card that says "Scheduled · ready" for a post
            that went out this morning — or that Instagram no longer has — is
            worse than no status at all. */}
        {status?.removed ? (
          <span className="hchip warn" title="Published, then deleted on Instagram">
            Removed on Instagram
          </span>
        ) : status?.failed ? (
          <span className="hchip warn" title={status.reason ?? undefined}>
            {status.reason ? "Needs review" : "Failed"}
          </span>
        ) : status?.inFlight ? (
          <span className="hchip">Publishing…</span>
        ) : piece.metrics ? (
          <span className="meta">{fmt(piece.metrics.reach)} reach</span>
        ) : blocker ? (
          <span className="hchip warn">{blocker}</span>
        ) : (
          <span className="hchip ok">
            <Icon.check />
          </span>
        )}
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CALENDAR — month grid and channel lanes
   ═══════════════════════════════════════════════════════════════════════════ */

function Calendar({
  pieces,
  filter,
  onOpen,
  onNew,
}: {
  pieces: Piece[];
  filter: string;
  onOpen: (id: string) => void;
  onNew: (patch?: Partial<Piece>) => void;
}) {
  const store = useStore();
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<"month" | "lanes">("month");
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [weekStart, setWeekStart] = useState(() =>
    addDays(today, -((today.getDay() + 6) % 7)),
  );
  const [day, setDay] = useState<Date | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const dated = pieces.filter((p) => p.scheduledFor || p.publishedAt);
  const forDay = (date: Date) =>
    dated
      .filter(
        (p) =>
          (p.scheduledFor ?? p.publishedAt ?? "").slice(0, 10) === dateKey(date),
      )
      .sort((a, b) =>
        (a.scheduledFor ?? a.publishedAt ?? "").localeCompare(
          b.scheduledFor ?? b.publishedAt ?? "",
        ),
      );

  /** Dropping a card on a day keeps its time of day and moves only the date. */
  function dropOn(date: Date, pieceId: string) {
    const piece = store.pieces.find((p) => p.id === pieceId);
    if (!piece) return;
    const previous = piece.scheduledFor ?? piece.keptScheduledFor;
    const when = new Date(date);
    when.setHours(
      previous ? parseStamp(previous).getHours() : 9,
      previous ? parseStamp(previous).getMinutes() : 0,
      0,
      0,
    );
    store.reschedulePiece(pieceId, toStamp(when));
  }

  const monthLabel = cursor.toLocaleDateString([], {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div className="filters" style={{ justifyContent: "flex-start" }}>
        <button
          className="icobtn"
          aria-label="Previous"
          onClick={() =>
            mode === "month"
              ? setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              : setWeekStart(addDays(weekStart, -7))
          }
        >
          <Icon.left />
        </button>
        <button
          className="btn"
          onClick={() => {
            setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
            setWeekStart(addDays(today, -((today.getDay() + 6) % 7)));
          }}
        >
          Today
        </button>
        <button
          className="icobtn"
          aria-label="Next"
          onClick={() =>
            mode === "month"
              ? setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              : setWeekStart(addDays(weekStart, 7))
          }
        >
          <Icon.right />
        </button>
        <h2 style={{ marginLeft: 8 }}>
          {mode === "month"
            ? monthLabel
            : `${weekStart.toLocaleDateString([], { day: "numeric", month: "short" })} – ${addDays(
                weekStart,
                6,
              ).toLocaleDateString([], { day: "numeric", month: "short" })}`}
        </h2>
        <span className="grow" />
        <Seg
          items={[
            { id: "month", label: "Month" },
            { id: "lanes", label: "Channel lanes" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {mode === "month" ? (
        <>
          <div className="mhead">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mgrid">
            {monthMatrix(cursor.getFullYear(), cursor.getMonth()).map((date) => {
              const key = dateKey(date);
              const items = forDay(date);
              const outside = date.getMonth() !== cursor.getMonth();
              const isToday = key === dateKey(today);
              const past = date < today && !isToday;
              const reach = items.reduce(
                (sum, p) => sum + (p.metrics?.reach ?? 0),
                0,
              );
              return (
                <button
                  key={key}
                  className={`mcell ${outside ? "pad" : ""} ${
                    isToday ? "today" : past ? "past" : ""
                  } ${overKey === key ? "over" : ""}`}
                  onClick={() => setDay(date)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverKey(key);
                  }}
                  onDragLeave={() => setOverKey((c) => (c === key ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverKey(null);
                    const id = e.dataTransfer.getData("text/piece");
                    if (id) dropOn(date, id);
                  }}
                >
                  <div className="mday">
                    <b>{date.getDate()}</b>
                    {isToday && <em>today</em>}
                    {reach > 0 && <span className="mreach">{fmt(reach)}</span>}
                  </div>
                  {items.slice(0, 3).map((piece) => {
                    const channel = store.channels.find(
                      (c) => c.id === piece.channels[0],
                    );
                    const stamp = piece.scheduledFor ?? piece.publishedAt!;
                    return (
                      <span
                        key={piece.id}
                        className="mitem"
                        style={chStyle(channel)}
                      >
                        {channel && <Glyph platform={channel.platform} />}
                        <em>{formatTime(stamp)}</em>
                        <span>
                          {piece.body.trim() ||
                            piece.parts[0]?.body ||
                            piece.title ||
                            "Untitled"}
                        </span>
                      </span>
                    );
                  })}
                  {items.length > 3 && (
                    <span className="mmore">+{items.length - 3} more</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="anote" style={{ padding: "0 18px" }}>
            Every chip is tinted by the channel it leaves from and carries that
            channel's platform mark. Drag a card onto a day to move it; the time
            of day is kept.
          </p>
        </>
      ) : (
        <Lanes
          weekStart={weekStart}
          filter={filter}
          forDay={forDay}
          onOpen={onOpen}
          onNew={onNew}
          onDrop={dropOn}
        />
      )}

      <ChannelLegend />

      {day && (
        <DayDrawer
          date={day}
          pieces={forDay(day)}
          onClose={() => setDay(null)}
          onOpen={onOpen}
          onNew={onNew}
        />
      )}
    </>
  );
}

function Lanes({
  weekStart,
  filter,
  forDay,
  onOpen,
  onNew,
  onDrop,
}: {
  weekStart: Date;
  filter: string;
  forDay: (date: Date) => Piece[];
  onOpen: (id: string) => void;
  onNew: (patch?: Partial<Piece>) => void;
  onDrop: (date: Date, pieceId: string) => void;
}) {
  const store = useStore();
  const today = dateKey(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const lanes = store.scopedChannels.filter((c) => passes(c, filter));

  if (!lanes.length) {
    return (
      <Blank icon="link" title="No channels to lay out">
        Channel lanes show one row per account, so an empty run of days is
        something you can see rather than something you have to remember.
        Connect a channel first.
      </Blank>
    );
  }

  return (
    <>
      <div className="lanes">
        <div className="lanehead">
          <div className="corner">{lanes.length} channels</div>
          {days.map((date) => (
            <div
              key={dateKey(date)}
              className={`dhead ${dateKey(date) === today ? "today" : ""}`}
            >
              <b>{date.toLocaleDateString([], { weekday: "short" })}</b>
              <span className="meta">{date.getDate()}</span>
            </div>
          ))}
        </div>
        {lanes.map((channel) => (
          <div className="lane" key={channel.id} style={chStyle(channel)}>
            <div className="lanelab">
              <Avatar channel={channel} size="sm" />
              <span className="ah">{channel.handle}</span>
              <Glyph platform={channel.platform} />
              <span className="cadmini">
                {channel.cadence.actual}/{channel.cadence.target}
              </span>
            </div>
            {days.map((date) => {
              const items = forDay(date).filter((p) =>
                p.channels.includes(channel.id),
              );
              return (
                <div
                  key={dateKey(date)}
                  className={`cellw ${dateKey(date) === today ? "today" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/piece");
                    if (id) onDrop(date, id);
                  }}
                  onDoubleClick={() => {
                    const when = new Date(date);
                    when.setHours(9, 0, 0, 0);
                    onNew({
                      channels: [channel.id],
                      scheduledFor: toStamp(when),
                      col: "scheduled",
                    });
                  }}
                >
                  {items.map((piece) => (
                    <button
                      key={piece.id}
                      className="ev"
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/piece", piece.id)
                      }
                      onClick={() => onOpen(piece.id)}
                    >
                      <span className="evt">
                        {formatTime(piece.scheduledFor ?? piece.publishedAt!)}
                      </span>
                      <span className="evb">
                        {piece.body.trim() || piece.title || "Untitled"}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="anote" style={{ padding: "0 18px 18px" }}>
        One lane per channel. An empty run of days on a lane is the thing you are
        meant to see. Double-click a cell to write into it.
      </p>
    </>
  );
}

function DayDrawer({
  date,
  pieces,
  onClose,
  onOpen,
  onNew,
}: {
  date: Date;
  pieces: Piece[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: (patch?: Partial<Piece>) => void;
}) {
  const store = useStore();

  return (
    <>
      <button
        className="scrim-full"
        style={{ opacity: 1, pointerEvents: "auto" }}
        aria-label="Close day"
        onClick={onClose}
      />
      <aside className="drawer" style={{ translate: "0 0" }}>
        <header className="bar" style={{ padding: "0 16px" }}>
          <div className="ttl">
            <h1 style={{ fontSize: "var(--f1)" }}>
              {date.toLocaleDateString([], { day: "numeric", month: "long" })}
            </h1>
            <div className="sub">{pieces.length} scheduled</div>
          </div>
          <span className="grow" />
          <button className="icobtn bare" aria-label="Close" onClick={onClose}>
            <Icon.close />
          </button>
        </header>
        <div className="drawerbody">
          {pieces.map((piece) => {
            const channel = store.channels.find(
              (c) => c.id === piece.channels[0],
            );
            const asset = store.assets.find(
              (a) => a.id === piece.slides[0]?.assetId,
            );
            return (
              <button
                key={piece.id}
                className="drow"
                style={chStyle(channel)}
                onClick={() => onOpen(piece.id)}
              >
                <span className="dtime">
                  {formatTime(piece.scheduledFor ?? piece.publishedAt!)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    {channel && <Avatar channel={channel} size="sm" />}
                    <span
                      className="sans"
                      style={{ fontSize: "var(--f-2)", fontWeight: 700 }}
                    >
                      {channel?.handle ?? "No channel"}
                    </span>
                    <span className="k">{KIND_LABEL[piece.kind]}</span>
                  </span>
                  <span style={{ fontSize: "var(--f0)", lineHeight: 1.4 }}>
                    {piece.body.trim() || piece.title || "Untitled"}
                  </span>
                </span>
                {asset && (
                  <span
                    className="frame"
                    style={{ width: 34, height: 34, borderRadius: 5, flex: "0 0 auto" }}
                  >
                    <AssetMedia asset={asset} />
                  </span>
                )}
              </button>
            );
          })}
          {!pieces.length && (
            <p className="empty">
              Nothing scheduled. Drag something here from the Ready column.
            </p>
          )}
          <button
            className="kadd"
            style={{ marginTop: 6 }}
            onClick={() => {
              const when = new Date(date);
              when.setHours(9, 0, 0, 0);
              onNew({ scheduledFor: toStamp(when), col: "scheduled" });
              onClose();
            }}
          >
            <Icon.plus /> Schedule something on this day
          </button>
        </div>
      </aside>
    </>
  );
}
