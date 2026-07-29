import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useConfirm, usePrompt } from "../../components/Dialog";
import { Blank, SectionHead, Seg, chStyle } from "../../components/UI";
import { Glyph, Icon } from "../../lib/glyphs";
import { fmt, type Article } from "../../lib/model";
import { useStore } from "../../lib/store";

/*
 * Articles are the long room. Cards outside, one wide measure inside, and a
 * rail that keeps the outline and the destinations in view while you write.
 *
 * A published piece is read-only. Editing something already on Medium produces
 * a document that quietly disagrees with the live one, so the only way forward
 * from published is Duplicate.
 */

const words = (text: string) =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

const readingTime = (text: string) =>
  `${Math.max(1, Math.round(words(text) / 230))} min`;

export function ArticlesView() {
  const { articleId } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | Article["status"]>("all");

  const article = articleId
    ? store.articles.find((a) => a.id === articleId)
    : null;

  const counts = useMemo(() => {
    const result = { draft: 0, scheduled: 0, published: 0 };
    store.scopedArticles.forEach((a) => (result[a.status] += 1));
    return result;
  }, [store.scopedArticles]);

  if (articleId && article) {
    return <LongRoom article={article} onBack={() => navigate("/articles")} />;
  }

  const shown = store.scopedArticles.filter(
    (a) => filter === "all" || a.status === filter,
  );

  function start() {
    const made = store.createArticle();
    navigate(`/articles/${made.id}`);
  }

  if (!store.scopedArticles.length) {
    return (
      <>
        <header className="bar">
          <div className="ttl">
            <h1>Articles</h1>
            <div className="sub">The long-form room</div>
          </div>
        </header>
        <div className="scroll">
          <Blank
            icon="doc"
            title="No articles yet"
            action={
              <button className="btn pri" onClick={start}>
                <Icon.plus /> Start a piece
              </button>
            }
          >
            Long-form gets its own room: one wide measure, an outline that keeps
            score, and destinations you pick once. Everything shorter belongs in
            Plan.
          </Blank>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="bar">
        <div className="ttl">
          <h1>Articles</h1>
          <div className="sub">
            {counts.draft} drafts · {counts.scheduled} scheduled ·{" "}
            {counts.published} published
          </div>
        </div>
        <span className="grow" />
        <button className="btn pri" onClick={start}>
          <Icon.plus /> New article
        </button>
      </header>

      <div className="scroll">
        <div className="filters">
          {(
            [
              ["all", "All", store.scopedArticles.length],
              ["draft", "Drafts", counts.draft],
              ["scheduled", "Scheduled", counts.scheduled],
              ["published", "Published", counts.published],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              className={`fchip ${filter === id ? "on" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
              <span className="c">{count}</span>
            </button>
          ))}
        </div>

        <div className="artgrid">
          {shown.map((item) => {
            const done = item.outline.filter((o) => o.done).length;
            const pct = item.outline.length ? done / item.outline.length : 0;
            return (
              <article
                key={item.id}
                className="artcard"
                onClick={() => navigate(`/articles/${item.id}`)}
                style={{ cursor: "pointer" }}
              >
                <div className="atop">
                  <span className={`tag ${item.status}`}>
                    {item.status === "published" && <Icon.lock />} {item.status}
                  </span>
                  <span className="grow" />
                  <span className="meta">
                    {words(item.body).toLocaleString()} words ·{" "}
                    {readingTime(item.body)}
                  </span>
                </div>
                <h2>{item.title || "Untitled"}</h2>
                <p>{item.deck || "No deck yet."}</p>
                <div className="afoot">
                  {item.destinations.length ? (
                    item.destinations.map((id) => {
                      const channel = store.channels.find((c) => c.id === id);
                      if (!channel) return null;
                      return (
                        <span key={id} style={chStyle(channel)}>
                          <Glyph platform={channel.platform} tint />
                        </span>
                      );
                    })
                  ) : (
                    <span className="meta">no destination</span>
                  )}
                  <span className="grow" />
                  {item.status === "published" ? (
                    <span className="meta">{fmt(item.views)} views</span>
                  ) : item.status === "scheduled" && item.scheduledFor ? (
                    <span className="meta" style={{ color: "var(--rubric)" }}>
                      {item.scheduledFor.slice(5, 16).replace("T", " · ")}
                    </span>
                  ) : (
                    <>
                      <span
                        className="prog"
                        style={{ ["--p"]: pct } as React.CSSProperties}
                      >
                        <i />
                      </span>
                      <span className="meta">{Math.round(pct * 100)}%</span>
                    </>
                  )}
                </div>
              </article>
            );
          })}
          <button
            className="artcard"
            style={{
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-4)",
              boxShadow: "inset 0 0 0 1px var(--rule-2)",
              background: "none",
            }}
            onClick={start}
          >
            <Icon.plus />
            <span className="meta">Start a new piece</span>
          </button>
        </div>
      </div>
    </>
  );
}

function LongRoom({
  article,
  onBack,
}: {
  article: Article;
  onBack: () => void;
}) {
  const store = useStore();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const navigate = useNavigate();
  const locked = article.status === "published";
  const [pane, setPane] = useState<"write" | "preview">("write");

  const done = article.outline.filter((o) => o.done).length;
  const pct = article.outline.length ? done / article.outline.length : 0;
  const patch = (next: Partial<Article>) =>
    store.updateArticle(article.id, next);

  return (
    <>
      <header className="bar">
        <button className="icobtn bare" aria-label="Back" onClick={onBack}>
          <Icon.left />
        </button>
        <span className={`tag ${article.status}`}>
          {locked && <Icon.lock />} {article.status}
        </span>
        <span className="meta">
          {locked ? "Published" : "Saved"}{" "}
          {new Date(article.updatedAt).toLocaleDateString([], {
            day: "numeric",
            month: "short",
          })}
        </span>
        <span className="grow" />
        <span className="meta">
          {words(article.body).toLocaleString()} words ·{" "}
          {readingTime(article.body)}
        </span>
        <Seg
          items={[
            { id: "write", label: locked ? "Read" : "Write" },
            { id: "preview", label: "Preview" },
          ]}
          value={pane}
          onChange={setPane}
        />
        {locked ? (
          <button
            className="btn"
            onClick={() => {
              const copy = store.duplicateArticle(article.id);
              if (copy) navigate(`/articles/${copy.id}`);
            }}
          >
            Duplicate to edit
          </button>
        ) : (
          <button
            className="btn pri"
            onClick={() =>
              patch({
                status: article.status === "scheduled" ? "draft" : "scheduled",
              })
            }
          >
            {article.status === "scheduled" ? "Unschedule" : "Schedule"}
          </button>
        )}
      </header>

      <div className="longroom">
        <div className="lfbody">
          <div className="measure">
            {locked && (
              <div className="readonly">
                <Icon.lock />
                This piece is published and read-only. Duplicate it to make
                changes.
              </div>
            )}

            {pane === "write" && !locked ? (
              <>
                <input
                  className="lftitle"
                  style={{
                    width: "100%",
                    background: "none",
                    marginBottom: 16,
                  }}
                  value={article.title}
                  placeholder="Title"
                  onChange={(e) => patch({ title: e.target.value })}
                />
                <textarea
                  className="lfdeck"
                  style={{ width: "100%", background: "none", minHeight: 70 }}
                  value={article.deck}
                  placeholder="The deck — one paragraph on what this argues."
                  onChange={(e) => patch({ deck: e.target.value })}
                />
                <textarea
                  style={{
                    width: "100%",
                    minHeight: "58vh",
                    fontSize: "16.5px",
                    lineHeight: 1.68,
                    background: "none",
                  }}
                  value={article.body}
                  placeholder="Start writing…"
                  onChange={(e) => patch({ body: e.target.value })}
                />
              </>
            ) : (
              <>
                <h1 className="lftitle">{article.title || "Untitled"}</h1>
                {article.deck && <p className="lfdeck">{article.deck}</p>}
                {article.body
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((para, index) =>
                    para.startsWith("## ") ? (
                      <h2 key={index}>{para.slice(3)}</h2>
                    ) : (
                      <p key={index} className={locked ? "locked" : ""}>
                        {para}
                      </p>
                    ),
                  )}
                {!article.body.trim() && (
                  <p className="anote">Nothing written yet.</p>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="rail">
          <header className="bar" style={{ padding: "0 15px" }}>
            <b
              className="sans"
              style={{ fontSize: "var(--f-1)", fontWeight: 700 }}
            >
              Outline
            </b>
            <span className="grow" />
            <span className="meta">{Math.round(pct * 100)}%</span>
          </header>
          <div className="railbody">
            {article.outline.map((item) => (
              <button
                key={item.id}
                className={`orow ${item.done ? "done" : ""}`}
                onClick={() =>
                  patch({
                    outline: article.outline.map((o) =>
                      o.id === item.id ? { ...o, done: !o.done } : o,
                    ),
                  })
                }
              >
                <i className="obox">{item.done && <Icon.check />}</i>
                <span>{item.title}</span>
              </button>
            ))}
            {!locked && (
              <button
                className="addacct"
                onClick={async () => {
                  const title = (
                    await prompt({
                      title: "Add a section",
                      label: "Section",
                      placeholder: "The cost",
                      confirmLabel: "Add",
                    })
                  )?.trim();
                  if (!title) return;
                  patch({
                    outline: [
                      ...article.outline,
                      { id: `o-${Date.now()}`, title, done: false },
                    ],
                  });
                }}
              >
                <Icon.plus />
                <span>Add a section</span>
              </button>
            )}
            {!article.outline.length && (
              <p className="anote">
                An outline keeps score of what is still missing.
              </p>
            )}

            <SectionHead style={{ marginTop: 12 }}>Destinations</SectionHead>
            <div className="targets">
              {store.scopedChannels.map((channel) => {
                const on = article.destinations.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    className={`target ${on ? "on" : ""}`}
                    style={chStyle(channel)}
                    disabled={locked}
                    onClick={() =>
                      patch({
                        destinations: on
                          ? article.destinations.filter((id) => id !== channel.id)
                          : [...article.destinations, channel.id],
                      })
                    }
                  >
                    <Glyph platform={channel.platform} />
                    <span className="ah">{channel.handle}</span>
                    <i className="tick">{on && <Icon.check />}</i>
                  </button>
                );
              })}
              {!store.scopedChannels.length && (
                <p className="anote">No channels to aim at yet.</p>
              )}
            </div>

            {locked && (
              <>
                <SectionHead style={{ marginTop: 14 }}>How it did</SectionHead>
                <dl className="kv">
                  <dt>Views</dt>
                  <dd className="mono">{fmt(article.views)}</dd>
                  <dt>Reads</dt>
                  <dd className="mono">{fmt(article.reads)}</dd>
                  <dt>Claps</dt>
                  <dd className="mono">{article.claps}</dd>
                </dl>
              </>
            )}

            {!locked && (
              <button
                className="btn danger"
                style={{ justifyContent: "center", marginTop: 16 }}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete “${article.title}”`,
                    body: "The draft and its outline go with it. This cannot be undone.",
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  if (!ok) return;
                  store.deleteArticle(article.id);
                  onBack();
                }}
              >
                <Icon.trash /> Delete article
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
