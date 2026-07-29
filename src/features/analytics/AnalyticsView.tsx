import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Blank,
  FilterRail,
  HealthChip,
  SectionHead,
  Seg,
  chStyle,
  passes,
} from "../../components/UI";
import { AreaChart, Sparkline, cumulative } from "../../lib/charts";
import { addDays, dateKey, parseStamp } from "../../lib/dates";
import { Glyph, Icon } from "../../lib/glyphs";
import {
  KIND_LABEL,
  PLATFORM_LABEL,
  fmt,
  type Channel,
  type Piece,
} from "../../lib/model";
import { useStore } from "../../lib/store";

/*
 * Analytics is the one screen with no right to invent anything. Every number
 * here is summed from pieces that actually published and metrics a platform
 * actually reported; a channel with no data says so rather than drawing a
 * plausible line. The previous build shipped a seeded random walk per account,
 * which looked convincing and meant nothing.
 */

type Range = 7 | 30 | 90;

/** Daily reach for one channel over the range, from published pieces alone. */
function dailyReach(pieces: Piece[], days: number): number[] {
  const today = new Date();
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    buckets.set(dateKey(addDays(today, -(days - 1 - i))), 0);
  }
  for (const piece of pieces) {
    if (!piece.publishedAt || !piece.metrics) continue;
    const key = piece.publishedAt.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key)! + piece.metrics.reach);
    }
  }
  return [...buckets.values()];
}

const rangeLabels = (range: Range) =>
  range === 7
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : range === 30
      ? ["30d ago", "20d", "10d", "today"]
      : ["90d ago", "60d", "30d", "today"];

export function AnalyticsView({ onOpen }: { onOpen: (id: string) => void }) {
  const { channelId } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"overtime" | "cumulative">("overtime");
  const [range, setRange] = useState<Range>(30);

  const channel = channelId
    ? store.channels.find((c) => c.id === channelId)
    : null;

  if (channelId && channel) {
    return (
      <OneChannel
        channel={channel}
        range={range}
        setRange={setRange}
        view={view}
        setView={setView}
        onBack={() => navigate("/analytics")}
        onOpen={onOpen}
      />
    );
  }

  const shown = store.scopedChannels.filter((c) => passes(c, filter));

  if (!store.scopedChannels.length) {
    return (
      <>
        <header className="bar">
          <div className="ttl">
            <h1>Analytics</h1>
            <div className="sub">What any of it earned</div>
          </div>
        </header>
        <div className="scroll">
          <Blank
            icon="chart"
            title="No channels to measure"
            action={
              <button
                className="btn pri"
                onClick={() => navigate("/settings/channels")}
              >
                <Icon.link /> Connect a channel
              </button>
            }
          >
            Reach, followers and engagement arrive once a channel is connected
            and something has gone out. Nothing on this page is estimated — an
            empty chart means no data, not no activity.
          </Blank>
        </div>
      </>
    );
  }

  const published = store.scopedPieces.filter(
    (p) => p.col === "published" && p.metrics,
  );

  const totals = {
    reach: published.reduce((sum, p) => sum + (p.metrics?.reach ?? 0), 0),
    followers: shown.reduce((sum, c) => sum + c.followers, 0),
    posts: published.length,
    engagement: published.length
      ? published.reduce(
          (sum, p) =>
            sum +
            ((p.metrics!.likes + p.metrics!.comments + p.metrics!.shares) /
              Math.max(1, p.metrics!.reach)) *
              100,
          0,
        ) / published.length
      : 0,
  };

  const stacked = dailyReach(
    published.filter((p) =>
      p.channels.some((id) => shown.some((c) => c.id === id)),
    ),
    range,
  );
  const hasData = stacked.some((v) => v > 0);

  return (
    <>
      <header className="bar">
        <div className="ttl">
          <h1>Analytics</h1>
          <div className="sub">
            {shown.length} channel{shown.length === 1 ? "" : "s"} · last {range}{" "}
            days
          </div>
        </div>
        <span className="grow" />
        <Seg
          items={[
            { id: "overtime", label: "Over time" },
            { id: "cumulative", label: "Cumulative" },
          ]}
          value={view}
          onChange={setView}
        />
        <Seg
          items={[7, 30, 90].map((r) => ({
            id: String(r) as "7" | "30" | "90",
            label: `${r}d`,
          }))}
          value={String(range) as "7" | "30" | "90"}
          onChange={(next) => setRange(Number(next) as Range)}
        />
      </header>

      <div className="scroll">
        <FilterRail value={filter} onChange={setFilter} />

        <div className="anhead">
          <div className="totals">
            {[
              { k: "Reach", v: fmt(totals.reach) },
              { k: "Followers", v: fmt(totals.followers) },
              { k: "Posts out", v: String(totals.posts) },
              { k: "Engagement", v: `${totals.engagement.toFixed(1)}%` },
            ].map((total) => (
              <div className="tot" key={total.k}>
                <span className="stat-k">{total.k}</span>
                <b className="stat-v">{total.v}</b>
              </div>
            ))}
          </div>
        </div>

        {hasData && (
          <div className="anband">
            <section className="panel wide">
              <SectionHead
                meta={
                  shown.length === 1
                    ? shown[0].handle
                    : "all shown channels, summed"
                }
              >
                {view === "cumulative" ? "Cumulative reach" : "Reach per day"}
              </SectionHead>
              <div className="chartwrap">
                <AreaChart
                  series={[
                    {
                      label: "All channels",
                      color: "#23252b",
                      pts: view === "cumulative" ? cumulative(stacked) : stacked,
                    },
                  ]}
                  width={940}
                  height={168}
                  labels={rangeLabels(range)}
                />
              </div>
            </section>
          </div>
        )}

        <SectionHead
          style={{ padding: "2px 20px 10px" }}
          right={<span className="meta">click one for its full record</span>}
        >
          Channels
        </SectionHead>

        <div className="wall">
          {shown.map((c) => {
            const mine = published.filter((p) => p.channels.includes(c.id));
            const reach = mine.reduce(
              (sum, p) => sum + (p.metrics?.reach ?? 0),
              0,
            );
            const series = dailyReach(mine, range);
            const queued = store.pieces.filter(
              (p) => p.col === "scheduled" && p.channels.includes(c.id),
            ).length;
            return (
              <article
                key={c.id}
                className="chcard"
                style={chStyle(c)}
                onClick={() => navigate(`/analytics/${c.id}`)}
              >
                <header className="chhead">
                  <Avatar channel={c} />
                  <span className="chn">
                    <b>{c.handle}</b>
                    <em>
                      {PLATFORM_LABEL[c.platform]}
                      {c.project === null ? " · everywhere" : ""}
                    </em>
                  </span>
                  <span style={chStyle(c)}>
                    <Glyph platform={c.platform} tint />
                  </span>
                </header>
                <div className="chnums">
                  <span className="cn">
                    <b>{fmt(c.followers)}</b>
                    <em>followers</em>
                  </span>
                  <span className="cn">
                    <b>{fmt(reach)}</b>
                    <em>reach {range}d</em>
                  </span>
                </div>
                {series.some((v) => v > 0) && (
                  <Sparkline pts={series} color={c.tint} />
                )}
                <footer className="chfoot">
                  <span className="cad">
                    <i
                      className="cadbar"
                      style={
                        {
                          ["--p"]: c.cadence.target
                            ? Math.min(1, c.cadence.actual / c.cadence.target)
                            : 0,
                        } as React.CSSProperties
                      }
                    />
                    <em>
                      {c.cadence.actual}/{c.cadence.target} wk
                    </em>
                  </span>
                  <span className="grow" />
                  {c.connection === "connected" ? (
                    <span className="chq">
                      {queued ? (
                        <>
                          <b>{queued}</b> queued
                        </>
                      ) : (
                        "nothing queued"
                      )}
                    </span>
                  ) : (
                    <HealthChip channel={c} />
                  )}
                </footer>
              </article>
            );
          })}
          <button
            className="chcard add"
            onClick={() => navigate("/settings/channels")}
          >
            <Icon.plus />
            <span className="meta">Connect a channel</span>
          </button>
        </div>

        {!hasData && (
          <p className="anote" style={{ padding: "0 20px 30px" }}>
            No reach reported yet. Numbers appear here as soon as a connected
            channel publishes something — nothing on this page is estimated.
          </p>
        )}

        {published.length > 0 && (
          <div className="anband">
            <section className="panel wide">
              <SectionHead meta="by reach">Best performing</SectionHead>
              <PostTable
                pieces={[...published]
                  .sort(
                    (a, b) => (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0),
                  )
                  .slice(0, 6)}
                onOpen={onOpen}
              />
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function PostTable({
  pieces,
  onOpen,
}: {
  pieces: Piece[];
  onOpen: (id: string) => void;
}) {
  const store = useStore();
  const max = Math.max(1, ...pieces.map((p) => p.metrics?.reach ?? 0));

  return (
    <>
      <div className="postrow th">
        <span />
        <span>Piece</span>
        <span className="n">Reach</span>
        <span className="n">Likes</span>
        <span className="n">Comments</span>
        <span className="n">Shares</span>
        <span className="n">Saves</span>
        <span className="n">Eng.</span>
      </div>
      {pieces.map((piece) => {
        const channel = store.channels.find((c) => c.id === piece.channels[0]);
        const m = piece.metrics!;
        const engagement =
          ((m.likes + m.comments + m.shares) / Math.max(1, m.reach)) * 100;
        return (
          <button
            key={piece.id}
            className="postrow rankbar"
            style={
              {
                ...chStyle(channel),
                ["--p"]: (m.reach / max).toFixed(2),
              } as React.CSSProperties
            }
            onClick={() => onOpen(piece.id)}
          >
            <span className="thumb">
              <span className="ph" style={{ position: "absolute", inset: 0 }} />
            </span>
            <span className="pb">
              {piece.body.trim() || piece.title || "Untitled"}
              <br />
              <span className="meta">
                {channel?.handle} · {KIND_LABEL[piece.kind]} ·{" "}
                {piece.publishedAt?.slice(5, 10)}
              </span>
            </span>
            <span className="n">{fmt(m.reach)}</span>
            <span className="n">{fmt(m.likes)}</span>
            <span className="n">{m.comments}</span>
            <span className="n">{m.shares}</span>
            <span className="n">{fmt(m.saves)}</span>
            <span className="n" style={{ color: "var(--good)" }}>
              {engagement.toFixed(1)}%
            </span>
          </button>
        );
      })}
    </>
  );
}

function OneChannel({
  channel,
  range,
  setRange,
  view,
  setView,
  onBack,
  onOpen,
}: {
  channel: Channel;
  range: Range;
  setRange: (r: Range) => void;
  view: "overtime" | "cumulative";
  setView: (v: "overtime" | "cumulative") => void;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const store = useStore();
  const navigate = useNavigate();

  const mine = useMemo(
    () =>
      store.pieces.filter(
        (p) => p.channels.includes(channel.id) && p.col === "published",
      ),
    [store.pieces, channel.id],
  );
  const withMetrics = mine.filter((p) => p.metrics);
  const queued = store.pieces.filter(
    (p) => p.col === "scheduled" && p.channels.includes(channel.id),
  );

  const series = dailyReach(withMetrics, range);
  const totalReach = withMetrics.reduce(
    (sum, p) => sum + (p.metrics?.reach ?? 0),
    0,
  );
  const hasData = series.some((v) => v > 0);

  return (
    <>
      <header className="bar">
        <button className="icobtn bare" aria-label="Back" onClick={onBack}>
          <Icon.left />
        </button>
        <div className="ttl">
          <h1 style={{ fontSize: "var(--f1)" }}>{channel.handle}</h1>
        </div>
        <span className="grow" />
        <Seg
          items={[
            { id: "overtime", label: "Over time" },
            { id: "cumulative", label: "Cumulative" },
          ]}
          value={view}
          onChange={setView}
        />
        <Seg
          items={[7, 30, 90].map((r) => ({
            id: String(r) as "7" | "30" | "90",
            label: `${r}d`,
          }))}
          value={String(range) as "7" | "30" | "90"}
          onChange={(next) => setRange(Number(next) as Range)}
        />
        <button
          className="btn"
          onClick={() => navigate(`/settings/channels?channel=${channel.id}`)}
        >
          Channel settings
        </button>
      </header>

      <div className="scroll">
        <header className="chhero" style={chStyle(channel)}>
          <Avatar channel={channel} size="lg" />
          <div className="ttl">
            <h1>{channel.handle}</h1>
            <div className="sub">
              {PLATFORM_LABEL[channel.platform]} ·{" "}
              {channel.project === null
                ? "every project"
                : (store.projects.find((p) => p.id === channel.project)?.name ??
                  "—")}
            </div>
          </div>
          <span className="grow" />
          <HealthChip channel={channel} />
          <div className="chstats">
            <span className="cn">
              <b>{fmt(channel.followers)}</b>
              <em>followers</em>
            </span>
            <span className="cn">
              <b>{fmt(totalReach)}</b>
              <em>reach {range}d</em>
            </span>
            <span className="cn">
              <b>{mine.length}</b>
              <em>published</em>
            </span>
            <span className="cn">
              <b>
                {channel.cadence.actual}/{channel.cadence.target}
              </b>
              <em>cadence wk</em>
            </span>
          </div>
        </header>

        {hasData ? (
          <div className="anband" style={{ paddingTop: 16 }}>
            <section className="panel wide">
              <SectionHead meta={`${fmt(totalReach)} total`}>
                {view === "cumulative" ? "Cumulative reach" : "Reach per day"}
              </SectionHead>
              <AreaChart
                series={[
                  {
                    label: "Reach",
                    color: channel.tint,
                    pts: view === "cumulative" ? cumulative(series) : series,
                  },
                ]}
                width={940}
                height={168}
                labels={rangeLabels(range)}
              />
            </section>
          </div>
        ) : (
          <p className="anote" style={{ padding: "22px 22px 6px" }}>
            No numbers for this channel yet.
            {channel.connection === "connected"
              ? " They arrive after the next post goes out."
              : " Connect it to pull reach and followers automatically."}
          </p>
        )}

        <div className="anband">
          <section className="panel">
            <SectionHead meta={`${queued.length} pieces`}>
              Queued here
            </SectionHead>
            {queued.map((piece) => (
              <button
                key={piece.id}
                className="usedrow"
                style={chStyle(channel)}
                onClick={() => onOpen(piece.id)}
              >
                <span className="k">{KIND_LABEL[piece.kind]}</span>
                <span className="ub">
                  {piece.body.trim() || piece.title || "Untitled"}
                </span>
                <span className="meta" style={{ color: "var(--rubric)" }}>
                  {piece.scheduledFor
                    ? parseStamp(piece.scheduledFor).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                      })
                    : ""}
                </span>
              </button>
            ))}
            {!queued.length && (
              <p className="anote">
                Nothing queued for this channel. That is the number that matters
                on this page.
              </p>
            )}
          </section>

          <section className="panel">
            <SectionHead meta={`${mine.length} pieces`}>
              Published here
            </SectionHead>
            {mine.slice(0, 8).map((piece) => (
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
            {!mine.length && (
              <p className="anote">Nothing has gone out on this channel yet.</p>
            )}
          </section>
        </div>

        {withMetrics.length > 0 && (
          <div className="anband">
            <section className="panel wide">
              <SectionHead meta="every metric this platform reports">
                Best performing here
              </SectionHead>
              <PostTable
                pieces={[...withMetrics].sort(
                  (a, b) => (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0),
                )}
                onOpen={onOpen}
              />
            </section>
          </div>
        )}
      </div>
    </>
  );
}
