/* ───────────────────────────────────────────────────────────────────────────
   flows.js — five complete applications over one product.

   THE FORK IS THE SPINE. Every direction here holds the same feature set:
   scheduling and a calendar, eleven accounts across five platforms, an asset
   store, long-form writing, drafts that are not scheduled, and analytics. What
   differs is the SPINE — the one axis the app is organised along — and the
   spine decides where every feature lands, including where the numbers live.

     F1 Classic    spine: places.     Each feature is a route. Analytics is a route.
     F2 Studio     spine: material.   Stages of making. Numbers ride on the material.
     F3 Channels   spine: destination. Eleven accounts are the home screen.
     F4 Pipeline   spine: readiness.  Columns you cannot skip. Numbers are the last one.
     F5 Almanac    spine: time.       One axis, past and future. No analytics screen exists.

   A theme owns none of this and supplies only material. Everything renders from
   one component vocabulary — .bar .side .pane .row .card .chip .btn .field
   .frame .meta — so six themes style the vocabulary once and inherit all five
   applications. Layout comes from a small set of named grids on .win.
   ─────────────────────────────────────────────────────────────────────────── */

import {
  ACCOUNTS, ALMANAC, ANALYTICS, ASSETS, ASSET_FOLDERS, COMMAND, COMPOSER, CURRENT_PROJECT,
  DRAFTS, IDEAS, INBOX, LIBRARY, LIBRARY_FILTERS, LIVE, LONGFORM, MONTH, NEXT_DUE,
  PIPELINE, PLATFORMS, PROJECTS, QUEUE, SMART_LISTS, STUDIO, TRAY, WEEK,
  accountById, inProject,
} from "./data.js";

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ═══ glyphs ═══════════════════════════════════════════════════════════════ */

export const G = {
  x: `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M13.9 10.6 21.3 2h-1.8l-6.4 7.5L8 2H2l7.8 11.3L2 22h1.8l6.8-7.9L16 22h6l-8.1-11.4Zm-2.4 2.8-.8-1.1L4.4 3.3h2.7l5.1 7.3.8 1.1 6.6 9.4h-2.7l-5.4-7.7Z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" d="M7 2.9h10A4.1 4.1 0 0 1 21.1 7v10a4.1 4.1 0 0 1-4.1 4.1H7A4.1 4.1 0 0 1 2.9 17V7A4.1 4.1 0 0 1 7 2.9Z"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/></svg>`,
  threads: `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M16.5 11.3c-.1 0-.2-.1-.3-.1-.2-3.2-1.9-5-4.8-5-2 0-3.6.9-4.5 2.4l1.6 1.1c.7-1 1.7-1.3 2.9-1.3 1.7 0 2.8.9 3 2.6-.7-.2-1.5-.3-2.3-.3-2.6 0-4.4 1.4-4.4 3.5 0 2 1.7 3.3 3.7 3.3 1.8 0 3.1-.8 3.8-2.2.5.8.8 1.7.9 2.8-1 1-2.6 1.6-4.7 1.6-3.9 0-6.4-2.6-6.4-7.2S7.6 5 11.5 5c3 0 5.1 1.5 5.9 4.3l2-.5C18.4 5 15.6 3 11.5 3 6.3 3 3 6.5 3 12s3.3 9 8.5 9c3 0 5.2-1 6.5-2.6 1-1.2 1.4-2.7 1.3-4.4-.1-1.3-.5-2-1.8-2.7Zm-4.8 4.2c-1 0-1.8-.5-1.8-1.4 0-1 1-1.6 2.5-1.6.7 0 1.4.1 2 .3-.2 1.7-1.2 2.7-2.7 2.7Z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.77 2.5 4.77 5.76v5.69h-4v-5.05c0-1.2-.02-2.75-1.75-2.75-1.76 0-2.03 1.31-2.03 2.66v5.14h-4v-11Z"/></svg>`,
  medium: `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><ellipse cx="6.6" cy="12" rx="6.4" ry="6.9" fill="currentColor"/><ellipse cx="16.9" cy="12" rx="2.7" ry="6.3" fill="currentColor"/><ellipse cx="22.3" cy="12" rx="1.1" ry="5.5" fill="currentColor"/></svg>`,
  reddit: `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M22 12a2.1 2.1 0 0 0-3.55-1.5 10.3 10.3 0 0 0-5.4-1.7l.92-4.33 3 .64a1.75 1.75 0 1 0 .2-1.2l-3.6-.77a.6.6 0 0 0-.72.46l-1.07 5.02a10.3 10.3 0 0 0-5.3 1.7A2.1 2.1 0 1 0 4 14.1c0 .13.02.26.04.38C4 14.8 4 15.1 4 15.4c0 3.1 3.6 5.6 8 5.6s8-2.5 8-5.6c0-.3 0-.6-.05-.9A2.1 2.1 0 0 0 22 12ZM8.2 13.6a1.35 1.35 0 1 1 2.7 0 1.35 1.35 0 0 1-2.7 0Zm7.5 3.9c-.9.9-2.6 1-3.7 1s-2.8-.1-3.7-1a.4.4 0 0 1 .57-.57c.6.6 1.9.8 3.13.8s2.53-.2 3.13-.8a.4.4 0 0 1 .57.57Zm-.6-2.55a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Z"/></svg>`,
  search: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m10.6 10.6 3.1 3.1" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
  plus: `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  chev: `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="m4.5 6.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  left: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  right: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  dots: `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="3.4" cy="8" r="1.25" fill="currentColor"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="12.6" cy="8" r="1.25" fill="currentColor"/></svg>`,
  globe: `<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.4 8h11.2M8 2.4c1.5 1.6 2.2 3.5 2.2 5.6S9.5 12 8 13.6C6.5 12 5.8 10.1 5.8 8S6.5 4 8 2.4Z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>`,
  check: `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="m3.5 8.4 3 3 6-6.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  doc: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 2h5l4 4v8H3.5V2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8.5 2v4h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  film: `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.4 3v10M10.6 3v10" stroke="currentColor" stroke-width="1.1"/></svg>`,
  warn: `<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M8 2.6 14.4 13.4H1.6L8 2.6Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.6v3.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r=".85" fill="currentColor"/></svg>`,
  up: `<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><path d="M6 9.5V2.5m0 0L3 5.5M6 2.5l3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  down: `<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><path d="M6 2.5v7m0 0 3-3M6 9.5l-3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const KIND = { post: "Post", thread: "Thread", carousel: "Carousel", reel: "Reel", image: "Image", article: "Article", note: "Note", gap: "Account", todo: "Todo" };
const PLAB = { x: "X", instagram: "Instagram", threads: "Threads", linkedin: "LinkedIn", medium: "Medium", reddit: "Reddit" };

export const lights = `<div class="lights"><i data-l="r"></i><i data-l="y"></i><i data-l="g"></i></div>`;
const av = (a, cls = "") => `<span class="av ${cls}" data-platform="${a.platform}">${esc(a.name[0])}</span>`;
const kindOf = (r) => (r.kind === "thread" || r.kind === "carousel") && r.parts ? `${KIND[r.kind]} · ${r.parts}` : KIND[r.kind] ?? r.kind;
const num = (n) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
const delta = (d) => d === 0 ? `<span class="delta flat">—</span>`
  : `<span class="delta ${d > 0 ? "up" : "dn"}">${d > 0 ? G.up : G.down}${Math.abs(d).toFixed(1)}%</span>`;

/* ═══ charts ═══════════════════════════════════════════════════════════════
   Drawn, not decorated. Every plot below is real geometry over the data in
   data.js — no filler paths, no gradients standing in for a line.
   ════════════════════════════════════════════════════════════════════════ */

function spark(pts, w = 62, h = 18, fill = false) {
  const max = Math.max(...pts, 1), min = Math.min(...pts);
  const span = max - min || 1;
  const xy = pts.map((p, i) => [i / (pts.length - 1) * w, h - 1 - (p - min) / span * (h - 2)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line}L${w} ${h}L0 ${h}Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${fill ? `<path class="sfill" d="${area}"/>` : ""}<path class="sline" d="${line}"/></svg>`;
}

function areaChart(series, w = 640, h = 168) {
  const n = series[0].pts.length;
  const max = Math.max(...series.flatMap((s) => s.pts));
  const px = (i) => (i / (n - 1) * w).toFixed(1);
  const py = (v) => (h - v / max * (h - 8)).toFixed(1);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line class="gl" x1="0" x2="${w}" y1="${(h * f).toFixed(1)}" y2="${(h * f).toFixed(1)}"/>`).join("");
  const paths = series.map((s, k) => {
    const line = s.pts.map((v, i) => `${i ? "L" : "M"}${px(i)} ${py(v)}`).join(" ");
    return `<path class="cl" data-s="${k}" d="${line}"/>`;
  }).join("");
  const lead = series[0];
  const fill = `${lead.pts.map((v, i) => `${i ? "L" : "M"}${px(i)} ${py(v)}`).join(" ")}L${w} ${h}L0 ${h}Z`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${grid}<path class="cfill" d="${fill}"/>${paths}</svg>`;
}

function heatGrid() {
  const max = Math.max(...ANALYTICS.heat.flat());
  const rows = ["M", "T", "W", "T", "F", "S", "S"];
  return `<div class="heat">
    <div class="heatrow head"><span></span>${ANALYTICS.hours.map((hh) => `<span class="meta">${hh}</span>`).join("")}</div>
    ${ANALYTICS.heat.map((r, i) => `<div class="heatrow">
      <span class="meta hd">${rows[i]}</span>
      ${r.map((v) => `<i class="heatcell" style="--v:${(v / max).toFixed(2)}"${v === max ? ' data-peak="1"' : ""}></i>`).join("")}
    </div>`).join("")}
  </div>`;
}

/* ═══ shared surfaces ══════════════════════════════════════════════════════
   Assembled differently by each flow. The arrangement is the direction; these
   are the parts every direction has to arrange.
   ════════════════════════════════════════════════════════════════════════ */

function projectButton(p = CURRENT_PROJECT) {
  return `<button class="proj">
    <span class="pmark" style="--tint:${p.tint}">${p.mark}</span>
    <span class="pname"><b>${esc(p.name)}</b><em>${p.accounts} accounts · ${p.queued} queued</em></span>
    ${G.chev}
  </button>`;
}

/* Accounts in the sidebar. At eleven accounts a flat list stops working, so
   project-scoped handles come first and the two personal handles that belong
   to every project are separated out under Everywhere. */
function accountRail({ counts = true, projectFirst = true } = {}) {
  const scoped = LIVE.filter((a) => a.project === CURRENT_PROJECT.id);
  const global = LIVE.filter((a) => a.project === null);
  const other = LIVE.filter((a) => a.project && a.project !== CURRENT_PROJECT.id);

  const row = (a) => `<button class="arow" data-health="${a.health}">
    <span class="av" data-platform="${a.platform}">${esc(a.name[0])}<i class="dot" data-on="${a.connected}"></i></span>
    <span class="ah">${esc(a.handle)}</span>
    <i class="pgl sm" data-platform="${a.platform}">${G[a.platform]}</i>
    ${a.health === "reauth" ? `<span class="pend bad">${G.warn}</span>`
      : a.health === "quiet" ? `<span class="pend dim">quiet</span>`
      : counts && a.queued ? `<span class="pend">${a.queued}</span>` : `<span class="pend dim">0</span>`}
  </button>`;

  const group = (label, list, note = "") => list.length ? `<div class="agroup">
    <div class="ahead"><span>${esc(label)}</span>${note ? `<em>${esc(note)}</em>` : ""}<i class="ln"></i></div>
    ${list.map(row).join("")}</div>` : "";

  return `<div class="accts">
    ${projectFirst ? group(CURRENT_PROJECT.name, scoped) + group("Everywhere", global, "all projects") + group("Other projects", other)
      : PLATFORMS.filter((p) => p.n).map((p) => group(p.label, LIVE.filter((a) => a.platform === p.id))).join("")}
    <button class="addacct">${G.plus}<span>Connect an account…</span></button>
  </div>`;
}

/* The classic sidebar: switcher, search, smart lists, accounts, next-due. */
function sidebar(active = "queue", nav = SMART_LISTS) {
  return `<aside class="side">
    ${lights}
    ${projectButton()}
    <label class="field search">${G.search}<input placeholder="Search everything" spellcheck="false"><kbd>⌘K</kbd></label>
    <nav class="lists">
      ${nav.map((l) => `<button class="lrow${l.id === active ? " on" : ""}"><span class="lbl">${esc(l.label)}</span><span class="c">${l.count}</span></button>`).join("")}
    </nav>
    <div class="sechead railsec">Accounts <span class="c">${LIVE.length}</span></div>
    ${accountRail()}
    <footer class="nextdue"><i class="pulse"></i><span>Next out <b>in ${NEXT_DUE.in}</b> · ${esc(accountById(NEXT_DUE.account).handle)}</span></footer>
  </aside>`;
}

function mediaFrame(it, extra = "") {
  return `<div class="frame" style="--ratio:${it.ratio}"><div class="ph" data-tone="${it.tone}"></div>${extra}</div>`;
}

/* ── queue row ─────────────────────────────────────────────────────────── */

function queueRow(r, sel = "q1") {
  const primary = r.targets.length ? accountById(r.targets[0]) : null;
  const extra = r.targets.length - 1;
  return `<button class="row card" data-kind="${r.kind}" data-status="${r.status}"${r.id === sel ? ' data-sel="1"' : ""}>
    <div class="time"${r.time ? "" : ' data-na="1"'}>${r.time ? `<b>${r.time.slice(0, 2)}</b><s>:</s><b>${r.time.slice(3)}</b>` : "—"}</div>
    <div class="mid">
      <div class="who">
        <span class="h">${primary ? esc(primary.handle) : "No account"}${extra > 0 ? ` +${extra}` : ""}</span>
        ${r.flag ? `<span class="k warn">${esc(r.flag)}</span>` : `<span class="k">${esc(kindOf(r))}</span>`}
      </div>
      <div class="body">${esc(r.body)}</div>
      ${r.assets ? `<div class="strip">${Array.from({ length: Math.min(3, r.assets) }, (_, i) => `<i data-t="${i}"></i>`).join("")}${r.assets > 3 ? `<span class="more">+${r.assets - 3}</span>` : ""}</div>` : ""}
    </div>
    ${primary ? `<span class="pgl" data-platform="${primary.platform}">${G[primary.platform]}</span>` : "<span></span>"}
  </button>`;
}

/* ── composer ──────────────────────────────────────────────────────────── */

function composer() {
  const chips = COMPOSER.targets.map((id) => {
    const a = accountById(id);
    return `<span class="chip on" data-platform="${a.platform}">${G[a.platform]}<span>${esc(a.handle)}</span></span>`;
  }).join("");
  return `<section class="pane composer">
    <header class="bar">
      <span class="lead">To</span>${chips}
      <button class="chip add">${G.plus}<span>2 more in ${esc(CURRENT_PROJECT.name)}</span></button>
      <span class="grow"></span><button class="icobtn">${G.dots}</button>
    </header>
    <div class="cbody">
      <input class="ctitle" value="${esc(COMPOSER.title)}" spellcheck="false">
      <div class="parts">
        ${COMPOSER.parts.map((p, i) => `
          <div class="part${i === 0 ? " live" : ""}">
            <div class="pgutter"><i class="pdot"></i><i class="pline"></i></div>
            <div class="pmain"><div class="ptext">${esc(p.body)}</div>
              <div class="pmeta meta"><span>${p.n} / ${COMPOSER.parts.length}</span><span>${p.chars}</span></div></div>
          </div>`).join("")}
        <button class="addpart">${G.plus}<span>Add to thread</span></button>
      </div>
    </div>
    <footer class="dock">
      <button class="sched">${esc(COMPOSER.schedule)}</button>
      <button class="icobtn" title="Attach from assets">${G.film}</button>
      <span class="ring" style="--pct:.72"><b>219</b></span><span class="grow"></span>
      <button class="btn">Save draft</button><button class="btn pri">Schedule <kbd>⌘⏎</kbd></button>
    </footer>
  </section>`;
}

/* ── library gallery ───────────────────────────────────────────────────── */

function tileWeight(it) {
  if (it.kind === "reel") return 1.78;
  if (it.kind === "carousel") return 1.25;
  if (it.kind === "article") return 1.05;
  if (it.kind === "image") { const [w, h] = it.ratio.split("/").map(Number); return h / w + 0.1; }
  return 0.34 + Math.min(1.1, (it.body?.length ?? 0) / 150);
}

function tile(it, withReach = false) {
  const a = it.account ? accountById(it.account) : null;
  const cap = `<div class="cap">${a ? `${av(a, "sm")}<span class="ch">${esc(a.handle)}</span>` : `<span class="ch idea">Idea</span>`}<span class="grow"></span>${
    withReach && it.reach ? `<span class="cd meta reach">${num(it.reach)}</span>` : `<span class="cd meta">${esc(it.date)}</span>`}</div>`;
  let inner = "";
  if (it.kind === "reel") inner = mediaFrame(it, `<span class="scrim"></span><span class="playb">${G.play}</span><span class="pill">${it.duration}</span><span class="mt">${esc(it.title)}</span>`);
  else if (it.kind === "carousel") inner = `<span class="edge e2"></span><span class="edge e1"></span>` + mediaFrame(it, `<span class="pill">${it.slides} slides</span><span class="scrim"></span><span class="mt">${esc(it.title)}</span>`);
  else if (it.kind === "image") inner = mediaFrame(it, `<span class="scrim soft"></span><span class="mt">${esc(it.title)}</span>`);
  else if (it.kind === "article") inner = mediaFrame(it) + `<div class="artbody"><h3>${esc(it.title)}</h3><span class="src meta">${esc(it.source)}</span></div>`;
  else if (it.kind === "note") inner = `<div class="txt note"><span class="lab">Idea</span><p>${esc(it.body)}</p></div>`;
  else inner = `<div class="txt"><p>${esc(it.body)}</p>${it.kind === "thread" ? `<span class="lab">${it.parts} parts</span>` : ""}${a ? `<span class="tgl" data-platform="${a.platform}">${G[a.platform]}</span>` : ""}</div>`;
  return `<article class="tile" data-kind="${it.kind}"${it.id === "l3" ? ' data-sel="1"' : ""}>${inner}${cap}</article>`;
}

export function galleryPane(cols = 4, withReach = false) {
  const buckets = Array.from({ length: cols }, () => ({ h: 0, items: [] }));
  for (const it of LIBRARY) {
    const b = buckets.reduce((a, c) => (c.h < a.h ? c : a));
    b.items.push(it); b.h += tileWeight(it) + 0.16;
  }
  return `<section class="pane gallery">
    <header class="bar">
      <div class="ttl"><h1>Library</h1><div class="sub">342 published · ${esc(CURRENT_PROJECT.name)}</div></div>
      <span class="grow"></span>
      <label class="field search sm">${G.search}<input placeholder="Filter" spellcheck="false"></label>
      <div class="seg"><button class="on">Grid</button><button>Reach</button></div>
    </header>
    <div class="filters">${LIBRARY_FILTERS.map((f, i) => `<button class="fchip${i === 0 ? " on" : ""}">${esc(f.label)}<span class="c">${f.count}</span></button>`).join("")}</div>
    <div class="gal">${buckets.map((b) => `<div class="galcol">${b.items.map((t) => tile(t, withReach)).join("")}</div>`).join("")}</div>
  </section>`;
}

/* ── assets ────────────────────────────────────────────────────────────── */

function assetCell(a, opts = {}) {
  const badge = a.type === "video" ? `<span class="pill">${a.dur}</span>`
    : a.type === "set" ? `<span class="pill">${a.count}</span>` : "";
  return `<article class="acell card" data-type="${a.type}"${a.id === "as2" ? ' data-pick="1"' : ""}>
    ${a.type === "set" ? `<span class="edge e2"></span><span class="edge e1"></span>` : ""}
    <div class="frame" style="--ratio:${a.ratio}">
      <div class="ph" data-tone="${a.tone}"></div>
      ${a.type === "video" ? `<span class="playb sm">${G.play}</span>` : ""}
      ${badge}
      ${a.usedIn === 0 ? `<span class="unused">unused</span>` : ""}
    </div>
    <div class="ameta">
      <span class="an">${esc(a.title)}</span>
      <span class="grow"></span>
      ${opts.earn && a.reach ? `<span class="earn">${num(a.reach)}</span>`
        : a.usedIn ? `<span class="usedin" title="${a.usedIn} pieces used this">×${a.usedIn}</span>` : ""}
    </div>
  </article>`;
}

function assetsPane(opts = {}) {
  return `<section class="pane assets">
    <header class="bar">
      <div class="ttl"><h1>Assets</h1><div class="sub">214 files · 39 unsorted · 6.4 GB</div></div>
      <span class="grow"></span>
      <label class="field search sm">${G.search}<input placeholder="Filter by tag" spellcheck="false"></label>
      <div class="seg"><button class="on">Newest</button><button>Unused</button><button>Earned</button></div>
      <button class="icobtn acc" title="Import">${G.plus}</button>
    </header>
    <div class="filters">${ASSET_FOLDERS.map((f, i) => `<button class="fchip${i === 0 ? " on" : ""}${f.warn ? " warn" : ""}">${esc(f.label)}<span class="c">${f.count}</span></button>`).join("")}</div>
    <div class="assetgrid">${ASSETS.map((a) => assetCell(a, opts)).join("")}</div>
  </section>`;
}

function assetInspector() {
  const a = ASSETS[1];
  return `<aside class="pane inspector">
    <header class="bar"><b class="isptitle">${esc(a.title)}</b><span class="grow"></span><button class="icobtn">${G.dots}</button></header>
    <div class="ispbody">
      <div class="frame ihero" style="--ratio:${a.ratio}"><div class="ph" data-tone="${a.tone}"></div><span class="pill">${a.count} images</span></div>
      <dl class="kv">
        <dt>Kind</dt><dd>Image set · ${a.count}</dd>
        <dt>Added</dt><dd>${a.date}</dd>
        <dt>Size</dt><dd>${a.size}</dd>
        <dt>Folder</dt><dd>Screens</dd>
      </dl>
      <div class="sechead">Used in</div>
      <div class="usedlist">
        <button class="row usedrow"><span class="k">Carousel</span><span class="ub">Eight screens, annotated</span><span class="meta">${num(a.reach)}</span></button>
        <button class="row usedrow ghost"><span class="k">Draft</span><span class="ub">Launch recap, ten cards</span><span class="meta">—</span></button>
      </div>
      <div class="sechead">Tags</div>
      <div class="tags">${a.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}<button class="chip add">${G.plus}</button></div>
      <button class="btn pri wide">${G.plus} Make a post from this</button>
    </div>
  </aside>`;
}

/* ── long-form ─────────────────────────────────────────────────────────── */

function longformList(sel = "lf1") {
  return `<section class="pane lflist">
    <header class="bar">
      <div class="ttl"><h1>Long-form</h1><div class="sub">5 pieces · 2 published</div></div>
      <span class="grow"></span><button class="icobtn acc">${G.plus}</button>
    </header>
    <div class="feed">
      ${LONGFORM.map((l) => `<button class="row lfrow card" data-status="${l.status}"${l.id === sel ? ' data-sel="1"' : ""}>
        <div class="lfmain">
          <div class="who"><span class="h">${esc(l.title)}</span></div>
          <div class="meta lfsub">${l.words.toLocaleString()} words · ${l.read} · ${esc(l.updated)}</div>
        </div>
        <div class="lfright">
          ${l.status === "published" ? `<span class="k">${l.ratio}% read</span>`
            : l.status === "scheduled" ? `<span class="sched sm">${esc(l.when)}</span>`
            : `<span class="prog" style="--p:${l.pct}"><i></i></span>`}
          <span class="lfdest">${l.dest.map((d) => `<i class="pgl" data-platform="${accountById(d).platform}">${G[accountById(d).platform]}</i>`).join("") || `<span class="meta">no destination</span>`}</span>
        </div>
      </button>`).join("")}
    </div>
  </section>`;
}

function longformEditor() {
  const l = LONGFORM[0];
  return `<section class="pane lfeditor">
    <header class="bar">
      <span class="meta">Draft · saved ${esc(l.updated)}</span>
      <span class="grow"></span>
      <span class="meta">${l.words.toLocaleString()} words · ${l.read}</span>
      <div class="seg"><button class="on">Write</button><button>Outline</button><button>Preview</button></div>
      <button class="btn pri">Schedule</button>
    </header>
    <div class="lfbody">
      <h1 class="lftitle">${esc(l.title)}</h1>
      <p class="lfdeck">${esc(l.excerpt)}</p>
      <h2>The argument nobody has</h2>
      <p>Every local-first post I read argues about CRDTs. Almost none of them argue about the thing that actually decides whether your app is local-first: which row your code believes when the two disagree.</p>
      <p>That sounds like a small implementation question. It is not. It is the whole architecture, and every other decision — sync, conflict, offline, scheduling — is downstream of it.</p>
      <h2>Offline mode is not local-first</h2>
      <p>Offline mode is a degraded state you recover from. Local-first is the normal state, and the network is the thing that is optional. If your app has a spinner on cold start, you built a thin client with a cache.</p>
      <p class="lfcaret">Timestamps need a timezone or they are lies. A date without a time of day cannot schedule anything<i class="caret"></i></p>
    </div>
    <footer class="dock lfdock">
      <span class="meta">Destinations</span>
      ${l.dest.map((d) => { const a = accountById(d); return `<span class="chip on" data-platform="${a.platform}">${G[a.platform]}<span>${esc(a.handle)}</span></span>`; }).join("")}
      <span class="grow"></span>
      <span class="meta">${Math.round(l.pct * 100)}% of outline done</span>
      <span class="prog wide" style="--p:${l.pct}"><i></i></span>
    </footer>
  </section>`;
}

function outlineRail() {
  const l = LONGFORM[0];
  return `<aside class="pane outline">
    <header class="bar"><b class="isptitle">Outline</b><span class="grow"></span><span class="meta">${Math.round(l.pct * 100)}%</span></header>
    <div class="ispbody">
      ${l.outline.map((o, i) => `<button class="orow${o.done ? " done" : ""}${i === 4 ? " on" : ""}">
        <i class="obox">${o.done ? G.check : ""}</i><span>${esc(o.h)}</span></button>`).join("")}
      <button class="addacct">${G.plus}<span>Add a section</span></button>
      <div class="sechead">Also published</div>
      ${LONGFORM.filter((x) => x.status === "published").map((x) => `<button class="row usedrow">
        <span class="ub">${esc(x.title)}</span><span class="meta">${num(x.views)}</span></button>`).join("")}
    </div>
  </aside>`;
}

/* ── accounts surfaces ─────────────────────────────────────────────────── */

function healthChip(a) {
  if (a.health === "reauth") return `<span class="hchip bad">${G.warn} Reconnect</span>`;
  if (a.health === "quiet") return `<span class="hchip warn">Quiet ${esc(a.last)}</span>`;
  if (a.health === "off") return `<span class="hchip off">Not connected</span>`;
  return `<span class="hchip ok">${G.check} Connected</span>`;
}

function accountsTable() {
  return `<section class="pane acctable">
    <header class="bar">
      <div class="ttl"><h1>Accounts</h1><div class="sub">11 connected across 5 platforms · 1 needs attention</div></div>
      <span class="grow"></span>
      <div class="seg"><button class="on">By platform</button><button>By project</button></div>
      <button class="btn pri">${G.plus} Connect</button>
    </header>
    <div class="feed acclist">
      <div class="acchead">
        <span>Account</span><span>Scope</span><span>Followers</span><span>7 days</span>
        <span>Cadence</span><span>Queued</span><span>Status</span>
      </div>
      ${PLATFORMS.filter((p) => p.n).map((p) => `
        <div class="day"><h2>${G[p.id]} ${PLAB[p.id]}</h2><span class="dt meta">${p.n} account${p.n > 1 ? "s" : ""}</span><span class="ln"></span></div>
        ${ACCOUNTS.filter((a) => a.platform === p.id).map((a) => `
          <button class="accrow" data-health="${a.health}">
            <span class="accname">${av(a)}<b>${esc(a.handle)}</b></span>
            <span class="scope">${a.project === null ? `<span class="chip glob">${G.globe} Everywhere</span>`
              : `<span class="chip proj" style="--tint:${(PROJECTS.find((x) => x.id === a.project) || {}).tint}">${esc((PROJECTS.find((x) => x.id === a.project) || {}).name)}</span>`}</span>
            <span class="foll">${num(a.followers)}${delta(a.delta)}</span>
            <span class="sp">${spark(a.spark, 62, 18)}</span>
            <span class="cad"><i class="cadbar" style="--p:${a.cadence.target ? Math.min(1, a.cadence.actual / a.cadence.target) : 0}"></i><em>${a.cadence.actual}/${a.cadence.target} wk</em></span>
            <span class="qd">${a.queued || "—"}</span>
            <span class="st">${healthChip(a)}</span>
          </button>`).join("")}`).join("")}
      <div class="day"><h2>Not connected</h2><span class="ln"></span></div>
      <button class="accrow soon"><span class="accname">${G.reddit}<b>r/SideProject</b></span>
        <span class="scope"><span class="meta">—</span></span><span class="foll meta">—</span><span class="sp"></span>
        <span class="cad meta">—</span><span class="qd meta">—</span><span class="st"><span class="hchip off">Planned</span></span></button>
    </div>
  </section>`;
}

/* ── analytics surfaces ────────────────────────────────────────────────── */

function analyticsPane() {
  return `<section class="pane analytics">
    <header class="bar">
      <div class="ttl"><h1>Analytics</h1><div class="sub">${esc(ANALYTICS.window)} · ${esc(CURRENT_PROJECT.name)} + everywhere</div></div>
      <span class="grow"></span>
      <div class="seg"><button>7d</button><button class="on">30d</button><button>90d</button></div>
      <button class="icobtn">${G.dots}</button>
    </header>
    <div class="anbody">
      <div class="mrow">
        ${ANALYTICS.totals.map((t) => `<div class="metric card">
          <span class="mk meta">${esc(t.k)}</span><b class="mv">${esc(t.v)}</b>${delta(t.d)}
        </div>`).join("")}
      </div>

      <section class="anblock wide">
        <div class="sechead">Reach by platform <span class="meta">daily, 30 days</span></div>
        ${areaChart(ANALYTICS.series)}
        <div class="legend">${ANALYTICS.series.map((s, i) => `<span class="lg" data-s="${i}"><i></i>${esc(s.label)}</span>`).join("")}</div>
      </section>

      <div class="antwo">
        <section class="anblock">
          <div class="sechead">Best time to post <span class="meta">reach by hour</span></div>
          ${heatGrid()}
          <p class="anote">Thursday 09:00 is your peak. Six of your ten best posts left within an hour of it.</p>
        </section>

        <section class="anblock">
          <div class="sechead">Top pieces <span class="meta">by reach</span></div>
          <div class="toplist">
            ${ANALYTICS.top.map((t) => { const a = accountById(t.acct); return `<button class="row toprow">
              <span class="tbar" style="--p:${(t.reach / ANALYTICS.top[0].reach).toFixed(2)}"></span>
              <span class="tmain"><span class="tb">${esc(t.body)}</span>
                <span class="meta">${av(a, "sm")} ${esc(a.handle)} · ${esc(KIND[t.kind])} · ${esc(t.date)}</span></span>
              <span class="tnum"><b>${num(t.reach)}</b><em class="meta">${t.eng}%</em></span>
            </button>`; }).join("")}
          </div>
        </section>
      </div>

      <section class="anblock">
        <div class="sechead">Worth sending again <span class="meta">out-performed, over 30 days old</span></div>
        <div class="repost">
          ${ANALYTICS.reposts.map((r) => { const a = accountById(r.acct); return `<article class="card rcard">
            <div class="who">${av(a, "sm")}<span class="h">${esc(a.handle)}</span><span class="k">${esc(r.was)}</span><span class="grow"></span><b>${num(r.reach)}</b></div>
            <p>${esc(r.body)}</p>
            <button class="btn">Queue again</button>
          </article>`; }).join("")}
        </div>
      </section>
    </div>
  </section>`;
}

/* ── calendar surfaces ─────────────────────────────────────────────────── */

function monthGrid({ density = true, drawer = true } = {}) {
  const cells = [];
  for (let i = 0; i < MONTH.first; i++) cells.push(`<div class="mcell pad"></div>`);
  const maxReach = Math.max(...Object.values(MONTH.cells).map((c) => c.reach || 0));
  for (let d = 1; d <= MONTH.days; d++) {
    const c = MONTH.cells[d] || {};
    const past = d < MONTH.today;
    cells.push(`<div class="mcell${d === MONTH.today ? " today" : ""}${past ? " past" : ""}">
      <div class="mday"><b>${d}</b>${d === MONTH.today ? `<em>today</em>` : ""}</div>
      ${past && density && c.reach ? `<i class="mbar" style="--p:${(c.reach / maxReach).toFixed(2)}" title="${num(c.reach)} reach"></i>
        <span class="mreach meta">${num(c.reach)}</span>` : ""}
      ${c.sched ? `<div class="mitems">${c.sched.slice(0, 3).map((s) => {
        const a = accountById(s.acct);
        return `<span class="mitem" data-kind="${s.kind}"${s.failed ? ' data-status="failed"' : ""}>
          <i class="pgl" data-platform="${a.platform}">${G[a.platform]}</i><em>${s.t}</em><span>${esc(s.body)}</span></span>`;
      }).join("")}${c.sched.length > 3 ? `<span class="mmore">+${c.sched.length - 3} more</span>` : ""}</div>` : ""}
    </div>`);
  }
  return `<section class="pane month">
    <header class="bar">
      <div class="ttl"><h1>${esc(MONTH.label)}</h1><div class="sub">17 scheduled · 63 published this month</div></div>
      <span class="grow"></span>
      <div class="weeknav"><button class="icobtn">${G.left}</button><button class="btn">Today</button><button class="icobtn">${G.right}</button></div>
      <div class="seg"><button>Day</button><button>Week</button><button class="on">Month</button></div>
      <button class="icobtn acc">${G.plus}</button>
    </header>
    <div class="mhead">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<span class="meta">${d}</span>`).join("")}</div>
    <div class="mgrid">${cells.join("")}</div>
    ${drawer ? `<footer class="mfoot">
      <span class="pulse"></span><span class="meta">Past days carry the reach they earned. Drag a card onto a day to schedule it.</span>
      <span class="grow"></span><span class="meta">3 drafts with no time</span><button class="btn">Show drafts</button>
    </footer>` : ""}
  </section>`;
}

function weekLanes(lanes = LIVE.filter((a) => a.connected).slice(0, 8)) {
  const cell = (a, d) => {
    const items = WEEK.cells[`${a.id}|${d.key}`] ?? [];
    return `<div class="cell${d.today ? " today" : ""}${items.length ? "" : " empty"}">
      ${items.map((it) => `<button class="ev" data-kind="${it.kind}"${it.sel ? ' data-sel="1"' : ""}${it.failed ? ' data-status="failed"' : ""}>
        <span class="evt meta">${it.t}</span><span class="evb">${esc(it.body)}</span>
        ${it.parts ? `<span class="evn meta">${it.parts}</span>` : ""}</button>`).join("")}
    </div>`;
  };
  return `<div class="grid">
    <div class="gridhead">
      <div class="corner meta">${lanes.length} accounts</div>
      ${WEEK.days.map((d) => `<div class="dhead${d.today ? " today" : ""}"><b>${d.label}</b><span class="meta">${d.date}</span></div>`).join("")}
    </div>
    <div class="gridbody">
      ${lanes.map((a) => `<div class="lane" data-health="${a.health}">
        <div class="lanelab">${av(a)}<span class="ah">${esc(a.handle)}</span>
          <i class="pgl sm" data-platform="${a.platform}">${G[a.platform]}</i>
          <span class="grow"></span>
          <span class="cadmini" title="${a.cadence.actual} of ${a.cadence.target} this week">${a.cadence.actual}/${a.cadence.target}</span></div>
        ${WEEK.days.map((d) => cell(a, d)).join("")}
      </div>`).join("")}
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   F1 · CLASSIC — spine: PLACES
   Every feature is a route in the sidebar. It is the shape every scheduler
   already has, and the honest baseline the other four have to beat. Its
   weakness is structural and should be visible here: seven routes now, and the
   answer to the next feature is an eighth. Analytics is a place you visit,
   which means it is a place you stop visiting.
   ═══════════════════════════════════════════════════════════════════════════ */

const CLASSIC_NAV = [
  { id: "queue", label: "Queue", count: 17 },
  { id: "calendar", label: "Calendar", count: 17 },
  { id: "drafts", label: "Drafts", count: 9 },
  { id: "ideas", label: "Ideas", count: 12 },
  { id: "longform", label: "Long-form", count: 5 },
  { id: "library", label: "Library", count: 342 },
  { id: "assets", label: "Assets", count: 214 },
  { id: "analytics", label: "Analytics", count: null },
];

function classicNav(active) {
  return `<aside class="side">
    ${lights}
    ${projectButton()}
    <label class="field search">${G.search}<input placeholder="Search everything" spellcheck="false"><kbd>⌘K</kbd></label>
    <nav class="lists">
      ${CLASSIC_NAV.map((l) => `<button class="lrow${l.id === active ? " on" : ""}"><span class="lbl">${esc(l.label)}</span>${l.count !== null ? `<span class="c">${l.count}</span>` : ""}</button>`).join("")}
    </nav>
    <div class="sechead railsec">Accounts <span class="c">${LIVE.length}</span></div>
    ${accountRail()}
    <footer class="nextdue"><i class="pulse"></i><span>Next out <b>in ${NEXT_DUE.in}</b></span></footer>
  </aside>`;
}

const wrap = (layout, flow, screen, inner) =>
  `<div class="win" data-flow="${flow}" data-screen="${screen}" data-layout="${layout}">${inner}<span class="wash"></span><span class="grainl"></span></div>`;

const classicQueue = () => wrap("s-l-d", "classic", "queue", `
  ${classicNav("queue")}
  <section class="pane list">
    <header class="bar">
      <div class="ttl"><h1>Queue</h1><div class="sub">17 scheduled · ${esc(CURRENT_PROJECT.name)}</div></div>
      <span class="grow"></span>
      <div class="seg"><button class="on">List</button><button>Calendar</button></div>
      <button class="icobtn acc" title="New post (⌘N)">${G.plus}</button>
    </header>
    <div class="feed">
      ${QUEUE.map((g) => `<div class="daygrp">
        <div class="day"><h2>${esc(g.day)}</h2><span class="dt meta">${esc(g.stamp)}</span><span class="ln"></span></div>
        ${g.rows.map((r) => queueRow(r)).join("")}
      </div>`).join("")}
    </div>
  </section>
  ${composer()}`);

const classicCalendar = () => wrap("s-main", "classic", "calendar", `${classicNav("calendar")}${monthGrid()}`);
const classicLibrary = () => wrap("s-main-d", "classic", "library", `${classicNav("library")}${galleryPane(3)}${assetInspector()}`);
const classicAssets = () => wrap("s-main-d", "classic", "assets", `${classicNav("assets")}${assetsPane()}${assetInspector()}`);
const classicLongform = () => wrap("s-l-d", "classic", "longform", `${classicNav("longform")}${longformList()}${longformEditor()}`);
const classicAccounts = () => wrap("s-main", "classic", "accounts", `${classicNav("accounts")}${accountsTable()}`);
const classicAnalytics = () => wrap("s-main", "classic", "analytics", `${classicNav("analytics")}${analyticsPane()}`);

/* ═══════════════════════════════════════════════════════════════════════════
   F2 · STUDIO — spine: MATERIAL
   A workshop, not a filing system. Three permanent zones: the SHELF holds raw
   material — footage, stills, sets, half-thoughts — the BENCH is the one thing
   you are making right now, fanned out into per-destination pieces, and the
   DOCK is everything leaving, by time. Long-form gets its own quiet room.
   Analytics never becomes a page: an asset on the shelf carries what it earned
   the last time you used it, so the decision "reuse this or shoot something
   new" is answered where the decision is actually made.
   ═══════════════════════════════════════════════════════════════════════════ */

function studioRail(active) {
  const zones = [
    { id: "bench", label: "Bench", sub: "making now" },
    { id: "shelf", label: "Shelf", sub: "214 assets" },
    { id: "longroom", label: "Long room", sub: "5 pieces" },
    { id: "dock", label: "Dock", sub: "17 leaving" },
    { id: "gates", label: "Gates", sub: "11 accounts" },
  ];
  return `<aside class="side studiorail">
    ${lights}
    ${projectButton()}
    <nav class="zones">
      ${zones.map((z) => `<button class="zone${z.id === active ? " on" : ""}">
        <b>${esc(z.label)}</b><em>${esc(z.sub)}</em></button>`).join("")}
    </nav>
    <div class="sechead railsec">Ideas on the bench</div>
    <div class="ideastack">
      <button class="scard on"><b>${esc(STUDIO.idea.title)}</b><span class="meta">4 pieces · 2 scheduled</span></button>
      ${STUDIO.siblings.map((s) => `<button class="scard"><b>${esc(s.title)}</b><span class="meta">${s.n} piece${s.n > 1 ? "s" : ""} · ${esc(s.state)}</span></button>`).join("")}
      <button class="scard add">${G.plus}<span>Capture</span></button>
    </div>
    <footer class="nextdue"><i class="pulse"></i><span>Next out <b>in ${NEXT_DUE.in}</b></span></footer>
  </aside>`;
}

const studioBench = () => {
  const d = STUDIO;
  return wrap("s-main-d", "studio", "bench", `
    ${studioRail("bench")}
    <main class="pane benchmain">
      <header class="bar">
        <span class="meta">Captured ${esc(d.idea.captured)}</span>
        <span class="grow"></span>
        <button class="btn">Archive</button>
        <button class="btn pri">${G.plus} Add a piece</button>
      </header>
      <div class="benchbody">
        <section class="idea">
          <h1>${esc(d.idea.title)}</h1>
          <p class="thesis">${esc(d.idea.thesis)}</p>
          <div class="tags">${d.idea.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
        </section>
        <section class="todos">
          <div class="sechead">Before this ships</div>
          ${d.steps.map((t) => `<label class="todo${t.done ? " done" : ""}"><i class="box">${t.done ? G.check : ""}</i><span>${esc(t.body)}</span></label>`).join("")}
          <button class="addtodo">${G.plus}<span>Add a step</span></button>
        </section>
        <section class="fan">
          <div class="sechead">Pieces <span class="meta">one idea, four destinations</span></div>
          <div class="fanrow">
            ${d.pieces.map((v) => {
              const a = accountById(v.account);
              const asset = v.asset ? ASSETS.find((x) => x.id === v.asset) : null;
              return `<article class="card vcard" data-kind="${v.kind}" data-status="${v.status}">
                <header class="vhead">
                  <i class="pglyph" data-platform="${v.platform}">${G[v.platform]}</i>
                  <span class="vh">${esc(a.handle)}</span><span class="grow"></span>
                  <span class="k">${esc(KIND[v.kind])}</span>
                </header>
                ${asset ? `<div class="vasset"><div class="frame" style="--ratio:16/9"><div class="ph" data-tone="${asset.tone}"></div><span class="pill">${asset.count}</span></div></div>` : ""}
                <div class="vbody">${v.body ? esc(v.body) : `<span class="vempty">Nothing written yet.<br>Adapt the idea for ${esc(a.handle)}.</span>`}</div>
                <footer class="vfoot">
                  ${v.when ? `<span class="sched sm">${esc(v.when)}</span>` : `<span class="sched sm ghost">Needs a time</span>`}
                  <span class="grow"></span>
                  <span class="meta">${v.kind === "article" ? `${v.chars.toLocaleString()} words` : v.chars ? `${v.chars} ch` : "—"}</span>
                </footer>
              </article>`;
            }).join("")}
          </div>
        </section>
      </div>
    </main>
    <aside class="pane shelfrail">
      <header class="bar"><b class="isptitle">Shelf</b><span class="grow"></span><span class="meta">drag to a piece</span></header>
      <div class="ispbody">
        <div class="sechead">Drawn on by this idea</div>
        <div class="shelfgrid">${STUDIO.shelf.map((id) => assetCell(ASSETS.find((a) => a.id === id), { earn: true })).join("")}</div>
        <div class="sechead">Nearby, unused</div>
        <div class="shelfgrid">${ASSETS.filter((a) => a.usedIn === 0).slice(0, 4).map((a) => assetCell(a)).join("")}</div>
        <p class="anote">A number on a shelf item is what it earned last time. Nothing here is a dashboard.</p>
      </div>
    </aside>`);
};

const studioShelf = () => wrap("s-main-d", "studio", "shelf", `${studioRail("shelf")}${assetsPane({ earn: true })}${assetInspector()}`);
const studioLongroom = () => wrap("s-l-d", "studio", "longroom", `${studioRail("longroom")}${longformEditor()}${outlineRail()}`);

const studioDock = () => wrap("s-main", "studio", "dock", `
  ${studioRail("dock")}
  <section class="pane dockpane">
    <header class="bar">
      <div class="ttl"><h1>Dock</h1><div class="sub">17 pieces waiting to leave · 5 gates open</div></div>
      <span class="grow"></span>
      <div class="seg"><button class="on">Departures</button><button>Month</button></div>
      <button class="icobtn acc">${G.plus}</button>
    </header>
    <div class="feed dockfeed">
      ${QUEUE.slice(0, 3).map((g) => `<div class="daygrp">
        <div class="day"><h2>${esc(g.day)}</h2><span class="dt meta">${esc(g.stamp)}</span><span class="ln"></span></div>
        ${g.rows.map((r) => {
          const a = r.targets.length ? accountById(r.targets[0]) : null;
          return `<button class="dockrow row card" data-kind="${r.kind}" data-status="${r.status}">
            <span class="dgate">${a ? `<i class="pgl" data-platform="${a.platform}">${G[a.platform]}</i><b>${esc(a.handle)}</b>` : `<b class="meta">no gate</b>`}</span>
            <span class="dtime"><b>${r.time ?? "—"}</b></span>
            <span class="dbody">${esc(r.body)}</span>
            ${r.assets ? `<span class="dassets">${G.film} ${r.assets}</span>` : `<span class="dassets meta">text</span>`}
            <span class="k">${esc(kindOf(r))}</span>
            ${r.status === "failed" ? `<span class="hchip bad">${G.warn} Held</span>` : `<span class="hchip ok">Ready</span>`}
          </button>`;
        }).join("")}
      </div>`).join("")}
      <div class="day"><h2>No time yet</h2><span class="dt meta">${DRAFTS.length} held on the bench</span><span class="ln"></span></div>
      ${DRAFTS.map((d) => `<button class="dockrow row card ghost" data-kind="${d.kind}">
        <span class="dgate">${d.targets.length ? `<i class="pgl" data-platform="${accountById(d.targets[0]).platform}">${G[accountById(d.targets[0]).platform]}</i><b>${esc(accountById(d.targets[0]).handle)}</b>` : `<b class="meta">no gate</b>`}</span>
        <span class="dtime meta">—</span>
        <span class="dbody">${esc(d.body)}</span>
        <span class="dassets meta">${esc(d.age)}</span>
        <span class="k">${esc(kindOf(d))}</span>
        <span class="hchip warn">${esc(d.blocker)}</span>
      </button>`).join("")}
    </div>
  </section>`);

const studioGates = () => wrap("s-main", "studio", "gates", `
  ${studioRail("gates")}
  <section class="pane gates">
    <header class="bar">
      <div class="ttl"><h1>Gates</h1><div class="sub">Eleven ways out · what each one earned this week</div></div>
      <span class="grow"></span>
      <div class="seg"><button class="on">Earned</button><button>Cadence</button></div>
      <button class="btn pri">${G.plus} Open a gate</button>
    </header>
    <div class="gatebody">
      ${PLATFORMS.filter((p) => p.n).map((p) => `
        <div class="gatesec">
          <div class="sechead">${G[p.id]} ${PLAB[p.id]} <span class="meta">${p.n}</span></div>
          <div class="gaterow">
            ${ACCOUNTS.filter((a) => a.platform === p.id).map((a) => `<article class="card gate" data-health="${a.health}">
              <header class="ghead">${av(a)}<b>${esc(a.handle)}</b>${a.project === null ? `<i class="gl">${G.globe}</i>` : ""}</header>
              <div class="gnum"><b>${num(a.reach7)}</b><em class="meta">reach · 7d</em>${delta(a.delta)}</div>
              ${spark(a.spark, 120, 30, true)}
              <footer class="gfoot">
                <span class="cad"><i class="cadbar" style="--p:${a.cadence.target ? Math.min(1, a.cadence.actual / a.cadence.target) : 0}"></i><em>${a.cadence.actual}/${a.cadence.target}</em></span>
                <span class="grow"></span>${healthChip(a)}
              </footer>
            </article>`).join("")}
          </div>
        </div>`).join("")}
    </div>
  </section>`);

/* ═══════════════════════════════════════════════════════════════════════════
   F3 · CHANNELS — spine: DESTINATION
   Eleven accounts is not a sidebar list, it is the home screen. The WALL shows
   every channel as a living card: followers, seven-day trend, cadence against
   target, what is queued, and whether it is healthy, quiet or broken. You drill
   into a channel and get that channel's own queue, its own grid, its own
   numbers — because a Medium publication and an Instagram account are not the
   same product and should not share one composer. Cross-channel work is an
   explicit act called Syndicate. Analytics is not a route; it is the wall.
   ═══════════════════════════════════════════════════════════════════════════ */

function channelTabs(active) {
  const t = [
    { id: "wall", label: "Wall" }, { id: "channel", label: "@validate.app" },
    { id: "week", label: "Week" }, { id: "syndicate", label: "Syndicate" }, { id: "connect", label: "Connect" },
  ];
  return `<header class="bar chbar">
    ${lights}
    ${projectButton()}
    <nav class="chtabs">${t.map((x) => `<button class="chtab${x.id === active ? " on" : ""}">${esc(x.label)}</button>`).join("")}</nav>
    <span class="grow"></span>
    <label class="field search sm">${G.search}<input placeholder="Jump to a channel" spellcheck="false"><kbd>⌘K</kbd></label>
    <button class="icobtn acc">${G.plus}</button>
  </header>`;
}

const channelsWall = () => wrap("top-main", "channels", "wall", `
  ${channelTabs("wall")}
  <main class="wall">
    <div class="wallhead">
      <div class="ttl"><h1>Eleven channels</h1><div class="sub">5 platforms · 3 projects · 2 handles everywhere</div></div>
      <span class="grow"></span>
      <div class="mrow tight">
        ${ANALYTICS.totals.slice(0, 3).map((t) => `<div class="metric flat"><span class="mk meta">${esc(t.k)}</span><b class="mv">${esc(t.v)}</b>${delta(t.d)}</div>`).join("")}
      </div>
    </div>
    <div class="needs">
      <span class="sechead">Needs you</span>
      ${INBOX.slice(0, 3).map((n) => `<button class="chip need" data-urgency="${n.urgency}"><i class="udot"></i>${esc(n.why)}</button>`).join("")}
    </div>
    <div class="wallgrid">
      ${LIVE.map((a) => `<article class="card chcard" data-health="${a.health}"${a.id === "ig1" ? ' data-pick="1"' : ""}>
        <header class="chhead">
          ${av(a)}
          <span class="chn"><b>${esc(a.handle)}</b><em class="meta">${PLAB[a.platform]}${a.project === null ? " · everywhere" : ` · ${esc((PROJECTS.find((p) => p.id === a.project) || {}).name || "")}`}</em></span>
          <i class="pgl" data-platform="${a.platform}">${G[a.platform]}</i>
        </header>
        <div class="chnums">
          <span class="cn"><b>${num(a.followers)}</b><em class="meta">followers</em>${delta(a.delta)}</span>
          <span class="cn"><b>${num(a.reach7)}</b><em class="meta">reach 7d</em></span>
        </div>
        ${spark(a.spark, 200, 34, true)}
        <footer class="chfoot">
          <span class="cad"><i class="cadbar" style="--p:${a.cadence.target ? Math.min(1, a.cadence.actual / a.cadence.target) : 0}"></i><em>${a.cadence.actual}/${a.cadence.target} wk</em></span>
          <span class="grow"></span>
          <span class="chq">${a.queued ? `<b>${a.queued}</b> queued` : `<em class="meta">nothing queued</em>`}</span>
        </footer>
        ${a.health !== "ok" ? `<div class="chalert">${healthChip(a)}<span class="meta">last out ${esc(a.last)}</span></div>` : ""}
      </article>`).join("")}
      <button class="card chcard add">${G.plus}<span>Connect a channel</span><em class="meta">Reddit, YouTube, Bluesky</em></button>
    </div>
  </main>`);

const channelsChannel = () => {
  const a = accountById("ig1");
  const mine = LIBRARY.filter((l) => l.account === "ig1" || l.account === "ig4");
  return wrap("top-main-d", "channels", "channel", `
    ${channelTabs("channel")}
    <main class="pane chdetail">
      <header class="chhero">
        <span class="chav">${av(a)}</span>
        <div class="ttl"><h1>${esc(a.handle)}</h1><div class="sub">${PLAB[a.platform]} · ${esc(CURRENT_PROJECT.name)} only · connected 4 months</div></div>
        <span class="grow"></span>
        <div class="chstats">
          <span class="cn"><b>${num(a.followers)}</b><em class="meta">followers</em>${delta(a.delta)}</span>
          <span class="cn"><b>${num(a.reach7)}</b><em class="meta">reach 7d</em></span>
          <span class="cn"><b>${a.eng7}%</b><em class="meta">engagement</em></span>
          <span class="cn"><b>${a.best}</b><em class="meta">best hour</em></span>
        </div>
      </header>
      <div class="chsub">
        <div class="seg"><button class="on">Queue</button><button>Grid</button><button>Assets</button><button>Numbers</button><button>Rules</button></div>
        <span class="grow"></span>
        <span class="meta">Posting 4× a week, on target</span>
        <button class="btn pri">${G.plus} New for this channel</button>
      </div>
      <div class="chbody">
        <section class="chqueue">
          <div class="sechead">Queued here <span class="meta">5 pieces</span></div>
          ${QUEUE.flatMap((g) => g.rows).filter((r) => r.targets.includes("ig1")).map((r) => queueRow(r, "q2")).join("")}
          <div class="sechead">Recently out</div>
          ${mine.slice(0, 3).map((l) => `<button class="row card outrow">
            <span class="time">${esc(l.date)}</span>
            <span class="mid"><span class="body">${esc(l.title || l.body)}</span></span>
            <span class="outnum"><b>${num(l.reach)}</b><em class="meta">reach</em></span>
          </button>`).join("")}
        </section>
        <section class="chgrid">
          <div class="sechead">The grid <span class="meta">how the profile actually reads</span></div>
          <div class="ig9">
            ${ASSETS.slice(0, 9).map((x) => `<div class="igc"><div class="ph" data-tone="${x.tone}"></div>${x.type === "video" ? `<i class="igv">${G.play}</i>` : ""}${x.type === "set" ? `<i class="igs">${x.count}</i>` : ""}</div>`).join("")}
          </div>
          <p class="anote">Three reels in a row. The next scheduled piece is a carousel, which breaks the run.</p>
        </section>
      </div>
    </main>
    <aside class="pane chrail">
      <header class="bar"><b class="isptitle">This channel</b><span class="grow"></span><button class="icobtn">${G.dots}</button></header>
      <div class="ispbody">
        <div class="sechead">30 days</div>
        ${areaChart([ANALYTICS.series[1]], 260, 90)}
        <dl class="kv">
          <dt>Scope</dt><dd>${esc(CURRENT_PROJECT.name)} only</dd>
          <dt>Cadence</dt><dd>4 / week · on target</dd>
          <dt>Best hour</dt><dd>${a.best}</dd>
          <dt>Kinds</dt><dd>Carousel, reel, image</dd>
          <dt>Auto-publish</dt><dd>Manual — notify me</dd>
        </dl>
        <div class="sechead">Top here</div>
        ${ANALYTICS.top.filter((t) => t.acct === "ig1" || t.acct === "ig4").map((t) => `<button class="row usedrow">
          <span class="ub">${esc(t.body)}</span><span class="meta">${num(t.reach)}</span></button>`).join("")}
        <div class="sechead">Rules</div>
        <div class="rules">
          <label class="todo done"><i class="box">${G.check}</i><span>Never two reels in a row</span></label>
          <label class="todo done"><i class="box">${G.check}</i><span>Alt text required</span></label>
          <label class="todo"><i class="box"></i><span>Mirror to @kartik.builds</span></label>
        </div>
      </div>
    </aside>`);
};

const channelsWeek = () => wrap("top-main-foot", "channels", "week", `
  ${channelTabs("week")}
  ${weekLanes()}
  <footer class="tray">
    <div class="trayhead"><b>Staging</b><span class="meta">${TRAY.length} without a channel or a time</span>
      <span class="grow"></span><span class="meta">Drag onto a lane to aim and schedule in one move</span></div>
    <div class="trayrow">
      ${TRAY.map((t) => `<button class="card tcard" data-kind="${t.kind}">
        <span class="k">${esc(kindOf(t))}</span><span class="tbody">${esc(t.body)}</span></button>`).join("")}
      <button class="card tcard add">${G.plus}<span>Capture</span></button>
    </div>
  </footer>`);

const channelsSyndicate = () => wrap("top-main", "channels", "syndicate", `
  ${channelTabs("syndicate")}
  <main class="synd">
    <div class="syndhead">
      <div class="ttl"><h1>Syndicate</h1><div class="sub">Write once. Adapt per channel. Send as one act.</div></div>
      <span class="grow"></span><button class="btn">Save as draft</button><button class="btn pri">Send to 5 channels <kbd>⌘⏎</kbd></button>
    </div>
    <section class="syndsource">
      <div class="sechead">Source</div>
      <div class="card syndcard">
        <input class="ctitle" value="${esc(COMPOSER.title)}" spellcheck="false">
        <p class="ptext">${esc(COMPOSER.parts[0].body)}</p>
        <div class="syndassets">${STUDIO.shelf.slice(0, 3).map((id) => { const x = ASSETS.find((y) => y.id === id); return `<span class="sa"><i class="ph" data-tone="${x.tone}"></i>${esc(x.title)}</span>`; }).join("")}
          <button class="chip add">${G.plus} Attach</button></div>
      </div>
    </section>
    <section class="syndtargets">
      <div class="sechead">Channels <span class="meta">${esc(CURRENT_PROJECT.name)} + everywhere · pick and adapt</span></div>
      <div class="syndgrid">
        ${inProject().map((a, i) => {
          const on = i < 5;
          return `<article class="card syndrow${on ? " on" : ""}" data-health="${a.health}">
            <span class="sw2"><i class="tick">${on ? G.check : ""}</i>${av(a)}<b>${esc(a.handle)}</b><i class="pgl" data-platform="${a.platform}">${G[a.platform]}</i></span>
            ${on ? `<span class="sadapt">
                <span class="k">${a.platform === "medium" ? "Article · 2,140 w" : a.platform === "instagram" ? "Carousel · 8" : a.platform === "linkedin" ? "Post · 1,180 c" : "Thread · 5"}</span>
                <span class="meta">${a.platform === "medium" ? "full piece" : a.platform === "instagram" ? "slides from Screens" : "trimmed to 219 c"}</span>
              </span>
              <span class="stime2"><b>${a.best}</b><em class="meta">best hour</em></span>`
            : `<span class="sadapt meta">not included</span><span class="stime2 meta">—</span>`}
          </article>`;
        }).join("")}
      </div>
      <p class="anote">Five channels, five shapes, one act. Per-channel edits stay on the channel and never rewrite the source.</p>
    </section>
  </main>`);

const channelsConnect = () => wrap("top-main", "channels", "connect", `
  ${channelTabs("connect")}
  ${accountsTable()}`);

/* ═══════════════════════════════════════════════════════════════════════════
   F4 · PIPELINE — spine: READINESS
   Six columns you cannot skip: Captured, Written, Dressed, Aimed, Scheduled,
   Out. Each column states its gate, and a card that cannot pass one says why on
   its face — no media, no account, no time, account went quiet. Drafts are not
   a place, they are the cards that have not reached Scheduled. Assets are what
   Dressed consumes. Analytics is the last column: a piece keeps its card after
   it goes out, and the card grows numbers. Nothing is ever finished off-screen.
   ═══════════════════════════════════════════════════════════════════════════ */

function pipeTabs(active) {
  const t = [{ id: "board", label: "Board" }, { id: "card", label: "One piece" },
    { id: "schedule", label: "Schedule" }, { id: "assets", label: "Assets" }, { id: "results", label: "Out" }];
  return `<header class="bar pipebar">
    ${lights}
    ${projectButton()}
    <nav class="chtabs">${t.map((x) => `<button class="chtab${x.id === active ? " on" : ""}">${esc(x.label)}</button>`).join("")}</nav>
    <span class="grow"></span>
    <div class="pipestat"><span class="meta">4 blocked</span><span class="dotsep">·</span><span class="meta">17 scheduled</span><span class="dotsep">·</span><span class="meta">next in ${NEXT_DUE.in}</span></div>
    <button class="icobtn acc">${G.plus}</button>
  </header>`;
}

function pipeCard(it, col) {
  const targets = (it.targets || []).map((id) => { const a = accountById(id); return `<i class="pgl" data-platform="${a.platform}">${G[a.platform]}</i>`; }).join("");
  const asset = it.asset ? ASSETS.find((a) => a.id === it.asset) : null;
  return `<article class="card pcard" data-kind="${it.kind}"${it.block ? ' data-block="1"' : ""}${it.failed ? ' data-status="failed"' : ""}${it.id === "p11" ? ' data-pick="1"' : ""}>
    ${asset ? `<div class="frame pca" style="--ratio:16/9"><div class="ph" data-tone="${asset.tone}"></div>${asset.type === "video" ? `<span class="playb sm">${G.play}</span>` : `<span class="pill">${asset.count}</span>`}</div>` : ""}
    <p class="pcb">${esc(it.body)}</p>
    <footer class="pcf">
      <span class="k">${esc(kindOf(it))}</span>
      ${targets ? `<span class="pct">${targets}</span>` : ""}
      <span class="grow"></span>
      ${it.reach ? `<span class="pcn"><b>${num(it.reach)}</b><em class="meta">${it.eng}%</em></span>`
        : it.when ? `<span class="sched sm">${esc(it.when)}</span>`
        : it.chars ? `<span class="meta">${it.chars.toLocaleString()} ch</span>`
        : `<span class="meta">${esc(it.age || "")}</span>`}
    </footer>
    ${it.block ? `<div class="blocker">${G.warn}<span>${esc(it.block)}</span><button class="bfix">Fix</button></div>` : ""}
    ${it.warn ? `<div class="blocker soft">${G.warn}<span>${esc(it.warn)}</span></div>` : ""}
    ${it.failed ? `<div class="blocker">${G.warn}<span>Failed to post</span><button class="bfix">Retry</button></div>` : ""}
  </article>`;
}

const pipelineBoard = () => wrap("top-main", "pipeline", "board", `
  ${pipeTabs("board")}
  <main class="board">
    ${PIPELINE.map((c) => `<section class="col" data-col="${c.id}">
      <header class="colhead">
        <b>${esc(c.label)}</b><span class="cn2">${c.n}</span>
        <span class="grow"></span>
        <button class="icobtn">${G.plus}</button>
      </header>
      <div class="gate2 meta">${esc(c.gate)}</div>
      <div class="colbody">
        ${c.items.map((i) => pipeCard(i, c.id)).join("")}
        ${c.n > c.items.length ? `<button class="colmore">${c.n - c.items.length} more</button>` : ""}
      </div>
    </section>`).join("")}
  </main>`);

const pipelineCard = () => {
  const a1 = accountById("x1"), a2 = accountById("th1");
  return wrap("top-main-d", "pipeline", "card", `
    ${pipeTabs("card")}
    <main class="pane onepiece">
      <header class="bar">
        <span class="meta">Aimed · one step from Scheduled</span>
        <span class="grow"></span>
        <button class="btn">Send back to Written</button>
        <button class="btn pri">Give it a time <kbd>⌘⏎</kbd></button>
      </header>
      <div class="opbody">
        <div class="opsteps">
          ${PIPELINE.map((c, i) => `<span class="ostep${i <= 3 ? " done" : ""}${i === 3 ? " here" : ""}">
            <i></i><em>${esc(c.label)}</em></span>`).join("")}
        </div>
        <h1 class="optitle">${esc(COMPOSER.title)}</h1>
        <div class="opmeta">
          <span class="chip on" data-platform="x">${G.x}${esc(a1.handle)}</span>
          <span class="chip on" data-platform="threads">${G.threads}${esc(a2.handle)}</span>
          <button class="chip add">${G.plus} aim wider</button>
          <span class="grow"></span><span class="k">Thread · 5</span>
        </div>
        <div class="parts">
          ${COMPOSER.parts.slice(0, 4).map((p, i) => `
            <div class="part${i === 0 ? " live" : ""}">
              <div class="pgutter"><i class="pdot"></i><i class="pline"></i></div>
              <div class="pmain"><div class="ptext">${esc(p.body)}</div>
                <div class="pmeta meta"><span>${p.n} / 5</span><span>${p.chars}</span></div></div>
            </div>`).join("")}
        </div>
      </div>
    </main>
    <aside class="pane opd">
      <header class="bar"><b class="isptitle">Gates</b><span class="grow"></span><span class="meta">4 of 6</span></header>
      <div class="ispbody">
        <div class="gatelist">
          <div class="grow2 pass">${G.check}<span><b>Captured</b><em>22 Jul, from a note</em></span></div>
          <div class="grow2 pass">${G.check}<span><b>Written</b><em>5 parts · 848 characters</em></span></div>
          <div class="grow2 pass">${G.check}<span><b>Dressed</b><em>text only — nothing needed</em></span></div>
          <div class="grow2 pass">${G.check}<span><b>Aimed</b><em>@validateapp, @validateapp</em></span></div>
          <div class="grow2 here">${G.warn}<span><b>Scheduled</b><em>no local time set</em></span></div>
          <div class="grow2">${G.dots}<span><b>Out</b><em>numbers appear here</em></span></div>
        </div>
        <div class="sechead">Suggested time</div>
        <button class="row usedrow"><span class="ub">Today 09:30</span><span class="meta">best hour on X</span></button>
        <button class="row usedrow"><span class="ub">Thu 09:00</span><span class="meta">your peak, all-time</span></button>
        <div class="sechead">Came from</div>
        <button class="row usedrow"><span class="k">Idea</span><span class="ub">Five things I got wrong…</span></button>
        <div class="sechead">Siblings</div>
        ${STUDIO.pieces.slice(1).map((p) => `<button class="row usedrow"><span class="k">${esc(KIND[p.kind])}</span><span class="ub">${esc(accountById(p.account).handle)}</span><span class="meta">${p.status}</span></button>`).join("")}
      </div>
    </aside>`);
};

const pipelineSchedule = () => wrap("top-main", "pipeline", "schedule", `${pipeTabs("schedule")}${monthGrid({ density: false })}`);
const pipelineAssets = () => wrap("top-main-d", "pipeline", "assets", `${pipeTabs("assets")}${assetsPane()}${assetInspector()}`);

const pipelineResults = () => wrap("top-main", "pipeline", "results", `
  ${pipeTabs("results")}
  <main class="pane results">
    <header class="bar">
      <div class="ttl"><h1>Out</h1><div class="sub">The last column, expanded · ${esc(ANALYTICS.window)}</div></div>
      <span class="grow"></span>
      <div class="seg"><button class="on">By reach</button><button>By channel</button><button>By kind</button></div>
    </header>
    <div class="anbody">
      <div class="mrow">${ANALYTICS.totals.map((t) => `<div class="metric card"><span class="mk meta">${esc(t.k)}</span><b class="mv">${esc(t.v)}</b>${delta(t.d)}</div>`).join("")}</div>
      <section class="anblock wide">
        <div class="sechead">What left, and what it did</div>
        ${areaChart(ANALYTICS.series)}
        <div class="legend">${ANALYTICS.series.map((s, i) => `<span class="lg" data-s="${i}"><i></i>${esc(s.label)}</span>`).join("")}</div>
      </section>
      <div class="antwo">
        <section class="anblock">
          <div class="sechead">Cards that did best</div>
          <div class="outcards">
            ${PIPELINE[5].items.map((i) => pipeCard(i, "out")).join("")}
          </div>
        </section>
        <section class="anblock">
          <div class="sechead">Best time to leave</div>
          ${heatGrid()}
          <p class="anote">Cards scheduled into Thursday 09:00 reach roughly twice what the same card reaches at 15:00.</p>
        </section>
      </div>
    </div>
  </main>`);

/* ═══════════════════════════════════════════════════════════════════════════
   F5 · ALMANAC — spine: TIME
   One axis, and the present is a fixed line on it. Scroll down and you are in
   what is planned; scroll up and you are in what happened, with what each piece
   earned sitting on the piece itself. There is no analytics screen, by
   construction — the split between "what I posted" and "what it did" is the
   thing every scheduler gets wrong, and this direction refuses to make it.
   Undated work waits in the WELL beside the axis until it is dropped onto a
   day. A SEASON page closes each month with the only summary the app offers.
   ═══════════════════════════════════════════════════════════════════════════ */

function almanacTabs(active) {
  const t = [{ id: "timeline", label: "Now" }, { id: "month", label: "Month" },
    { id: "well", label: "The well" }, { id: "season", label: "Season" }, { id: "tracks", label: "Tracks" }];
  return `<header class="bar almbar">
    ${lights}
    ${projectButton()}
    <nav class="chtabs">${t.map((x) => `<button class="chtab${x.id === active ? " on" : ""}">${esc(x.label)}</button>`).join("")}</nav>
    <span class="grow"></span>
    <label class="field cmd sm">
      <span class="prompt">›</span>
      <span class="typed"><i class="tok when">sat 9:30</i> <i class="tok who">@validateapp</i> five things I got wrong<i class="caret"></i></span>
    </label>
  </header>`;
}

function almItem(it, past) {
  const a = accountById(it.acct);
  const also = (it.also || []).map((id) => `<i class="pgl sm" data-platform="${accountById(id).platform}">${G[accountById(id).platform]}</i>`).join("");
  return `<article class="tlitem${it.next ? " next" : ""}${it.best ? " best" : ""}" data-kind="${it.kind}"${it.failed ? ' data-status="failed"' : ""}>
    <span class="tlt"><b>${it.t}</b></span>
    <span class="tldot"></span>
    <div class="tlmain">
      <div class="who">
        ${av(a, "sm")}<span class="h">${esc(a.handle)}</span>${also}
        <span class="k">${esc(kindOf(it))}${it.dur ? ` · ${it.dur}` : ""}${it.words ? ` · ${it.words.toLocaleString()} w` : ""}</span>
        ${it.failed ? `<span class="k warn">Failed</span>` : ""}
        ${it.next ? `<span class="k acc">Next out</span>` : ""}
        ${it.best ? `<span class="k acc">Best this week</span>` : ""}
      </div>
      <p class="tlb">${esc(it.body)}</p>
      ${past ? `<div class="tlnums">
        <span class="tn"><b>${num(it.reach)}</b><em class="meta">reach</em></span>
        <span class="tn"><b>${it.eng}%</b><em class="meta">engaged</em></span>
        <span class="tbar2" style="--p:${Math.min(1, it.reach / 22000).toFixed(2)}"></span>
      </div>` : ""}
    </div>
  </article>`;
}

const almanacTimeline = () => wrap("top-main-d", "almanac", "timeline", `
  ${almanacTabs("timeline")}
  <main class="alm">
    <div class="axis"></div>
    ${[...ALMANAC.past].reverse().map((d) => `
      <div class="tlday past">
        <div class="tldayhead"><b>${esc(d.day)}</b><span class="meta">${esc(d.rel)}</span>
          <span class="ln"></span><span class="dayreach">${num(d.reach)} <em class="meta">reach</em></span></div>
        ${d.items.map((i) => almItem(i, true)).join("")}
      </div>`).join("")}
    <div class="nowline"><i></i><b>Now</b><span class="meta">Saturday 26 July · 07:16 · Asia/Kolkata</span><i></i></div>
    ${ALMANAC.future.map((d) => `
      <div class="tlday">
        <div class="tldayhead"><b>${esc(d.day)}</b><span class="meta">${esc(d.rel)}</span>
          <span class="ln"></span><span class="meta">${d.items.length} leaving</span></div>
        ${d.items.map((i) => almItem(i, false)).join("")}
      </div>`).join("")}
  </main>
  <aside class="pane wellrail">
    <header class="bar"><b class="isptitle">The well</b><span class="grow"></span><span class="meta">26 undated</span></header>
    <div class="ispbody">
      <p class="anote">Nothing here has a time. Drag onto the axis to give it one.</p>
      <div class="sechead">Drafts <span class="c">9</span></div>
      ${DRAFTS.slice(0, 3).map((d) => `<article class="card wcard" data-kind="${d.kind}">
        <p>${esc(d.body)}</p>
        <footer><span class="k">${esc(kindOf(d))}</span><span class="grow"></span><span class="hchip warn">${esc(d.blocker)}</span></footer>
      </article>`).join("")}
      <div class="sechead">Ideas <span class="c">12</span></div>
      ${IDEAS.slice(0, 3).map((i) => `<article class="card wcard idea2"><p>${esc(i.body)}</p>
        <footer><span class="k">${esc(i.tag)}</span><span class="grow"></span><span class="meta">${esc(i.age)}</span></footer></article>`).join("")}
      <div class="sechead">Assets unused <span class="c">39</span></div>
      <div class="shelfgrid">${ASSETS.filter((a) => !a.usedIn).slice(0, 4).map((a) => assetCell(a)).join("")}</div>
    </div>
  </aside>`);

const almanacMonth = () => wrap("top-main", "almanac", "month", `${almanacTabs("month")}${monthGrid()}`);

const almanacWell = () => wrap("top-main", "almanac", "well", `
  ${almanacTabs("well")}
  <main class="pane wellmain">
    <header class="bar">
      <div class="ttl"><h1>The well</h1><div class="sub">26 things with no time · the only place work waits</div></div>
      <span class="grow"></span>
      <div class="seg"><button class="on">All</button><button>Drafts</button><button>Ideas</button><button>Assets</button><button>Long-form</button></div>
      <button class="icobtn acc">${G.plus}</button>
    </header>
    <div class="wellbody">
      <section class="wellcol">
        <div class="sechead">Drafts <span class="meta">written, not aimed or timed</span></div>
        ${DRAFTS.map((d) => `<article class="card wcard" data-kind="${d.kind}">
          <p>${esc(d.body)}</p>
          <footer>
            <span class="k">${esc(kindOf(d))}</span>
            ${d.targets.map((t) => `<i class="pgl sm" data-platform="${accountById(t).platform}">${G[accountById(t).platform]}</i>`).join("")}
            <span class="grow"></span><span class="meta">${esc(d.age)}</span><span class="hchip warn">${esc(d.blocker)}</span>
          </footer>
        </article>`).join("")}
      </section>
      <section class="wellcol">
        <div class="sechead">Ideas <span class="meta">a sentence and nothing else</span></div>
        ${IDEAS.map((i) => `<article class="card wcard idea2"><p>${esc(i.body)}</p>
          <footer><span class="k">${esc(i.tag)}</span><span class="grow"></span><span class="meta">${esc(i.age)}</span></footer></article>`).join("")}
      </section>
      <section class="wellcol">
        <div class="sechead">Long-form <span class="meta">by how finished it is</span></div>
        ${LONGFORM.filter((l) => l.status !== "published").map((l) => `<article class="card wcard lf">
          <b>${esc(l.title)}</b><p class="meta">${l.words.toLocaleString()} words · ${l.read}</p>
          <span class="prog" style="--p:${l.pct}"><i></i></span>
          <footer><span class="k">${esc(l.status)}</span><span class="grow"></span>
            ${l.dest.map((d) => `<i class="pgl sm" data-platform="${accountById(d).platform}">${G[accountById(d).platform]}</i>`).join("") || `<span class="meta">no destination</span>`}</footer>
        </article>`).join("")}
        <div class="sechead">Assets unused <span class="meta">39 of 214</span></div>
        <div class="shelfgrid">${ASSETS.filter((a) => !a.usedIn).map((a) => assetCell(a)).join("")}</div>
      </section>
    </div>
  </main>`);

const almanacSeason = () => wrap("top-main", "almanac", "season", `
  ${almanacTabs("season")}
  <main class="pane season">
    <header class="bar">
      <div class="ttl"><h1>${esc(ALMANAC.season.label)}</h1><div class="sub">The one summary this app offers</div></div>
      <span class="grow"></span>
      <div class="weeknav"><button class="icobtn">${G.left}</button><button class="btn">July</button><button class="icobtn">${G.right}</button></div>
    </header>
    <div class="seasonbody">
      <p class="seasonline">${esc(ALMANAC.season.line)}</p>
      <div class="mrow">
        ${ALMANAC.season.stats.map((s) => `<div class="metric card">
          <span class="mk meta">${esc(s.k)}</span><b class="mv sm">${esc(s.v)}</b><em class="meta">${esc(s.note)}</em>
        </div>`).join("")}
      </div>
      <section class="anblock wide">
        <div class="sechead">The month, day by day <span class="meta">reach, all channels</span></div>
        ${areaChart(ANALYTICS.series)}
        <div class="legend">${ANALYTICS.series.map((s, i) => `<span class="lg" data-s="${i}"><i></i>${esc(s.label)}</span>`).join("")}</div>
      </section>
      <div class="antwo">
        <section class="anblock">
          <div class="sechead">Channels, ranked</div>
          <div class="bars">
            ${[...LIVE].sort((a, b) => b.reach7 - a.reach7).slice(0, 8).map((a) => `<div class="brow">
              <span class="bl">${av(a, "sm")}<span class="ah">${esc(a.handle)}</span></span>
              <span class="bt" style="--p:${(a.reach7 / 41200).toFixed(2)}"></span>
              <b>${num(a.reach7)}</b></div>`).join("")}
          </div>
        </section>
        <section class="anblock">
          <div class="sechead">What to do in August</div>
          <div class="usedlist">
            ${ALMANAC.season.stats.slice(2).map(() => "").join("")}
            <button class="row usedrow"><span class="k">Quiet</span><span class="ub">@fieldnoteco has not posted in 11 days</span><span class="meta">act</span></button>
            <button class="row usedrow"><span class="k">Repeat</span><span class="ub">Send "how many columns" again — it out-performed twice</span><span class="meta">queue</span></button>
            <button class="row usedrow"><span class="k">Reuse</span><span class="ub">"Desk, 7am" earned 7.8K across 3 pieces</span><span class="meta">open</span></button>
            <button class="row usedrow"><span class="k">Sort</span><span class="ub">39 assets have never been filed</span><span class="meta">open</span></button>
          </div>
        </section>
      </div>
    </div>
  </main>`);

const almanacTracks = () => wrap("top-main-foot", "almanac", "tracks", `
  ${almanacTabs("tracks")}
  ${weekLanes()}
  <footer class="tray">
    <div class="trayhead"><b>The well</b><span class="meta">26 undated</span>
      <span class="grow"></span><span class="meta">Every track is an account. An empty run of days is the point.</span></div>
    <div class="trayrow">
      ${TRAY.map((t) => `<button class="card tcard" data-kind="${t.kind}">
        <span class="k">${esc(kindOf(t))}</span><span class="tbody">${esc(t.body)}</span></button>`).join("")}
      <button class="card tcard add">${G.plus}<span>Capture</span></button>
    </div>
  </footer>`);

/* ═══ registry ═════════════════════════════════════════════════════════════ */

export const FLOWS = [
  {
    id: "classic", n: "F1", name: "Classic", blurb: "Places · a route per feature",
    spine: "Places",
    note: "The incumbent, now built out honestly: eight routes covering queue, calendar, drafts, ideas, long-form, library, assets and analytics. It is the shape every scheduler already has, which is its strength — nothing to learn — and its weakness. Analytics is a place you visit, which means it is a place you eventually stop visiting, and the answer to the ninth feature is a ninth route.",
    screens: [
      { id: "queue", name: "Queue", render: classicQueue },
      { id: "calendar", name: "Calendar", render: classicCalendar },
      { id: "longform", name: "Long-form", render: classicLongform },
      { id: "library", name: "Library", render: classicLibrary },
      { id: "assets", name: "Assets", render: classicAssets },
      { id: "accounts", name: "Accounts", render: classicAccounts },
      { id: "analytics", name: "Analytics", render: classicAnalytics },
    ],
  },
  {
    id: "studio", n: "F2", name: "Studio", blurb: "Material · shelf, bench, dock",
    spine: "Material",
    note: "A workshop rather than a filing system. The Shelf holds raw material, the Bench holds the one idea you are making right now fanned into per-destination pieces, the Dock holds everything leaving. Long-form gets a quiet room of its own. Analytics never becomes a page: a shelf item carries what it earned last time it was used, so \"reuse this or shoot something new\" is answered where you actually make that decision.",
    screens: [
      { id: "bench", name: "Bench", render: studioBench },
      { id: "shelf", name: "Shelf", render: studioShelf },
      { id: "longroom", name: "Long room", render: studioLongroom },
      { id: "dock", name: "Dock", render: studioDock },
      { id: "gates", name: "Gates", render: studioGates },
    ],
  },
  {
    id: "channels", n: "F3", name: "Channels", blurb: "Destination · eleven accounts are home",
    spine: "Destination",
    note: "Eleven accounts is not a sidebar list, it is the home screen. Every channel is a living card — followers, trend, cadence against target, what is queued, whether it is healthy, quiet or broken. Drill in and you get that channel's own queue, grid, numbers and rules, because a Medium publication and an Instagram account are not the same product. Cross-posting becomes an explicit act called Syndicate. Analytics is not a route; it is the wall.",
    screens: [
      { id: "wall", name: "Wall", render: channelsWall },
      { id: "channel", name: "One channel", render: channelsChannel },
      { id: "week", name: "Week", render: channelsWeek },
      { id: "syndicate", name: "Syndicate", render: channelsSyndicate },
      { id: "connect", name: "Connect", render: channelsConnect },
    ],
  },
  {
    id: "pipeline", n: "F4", name: "Pipeline", blurb: "Readiness · six gates, no skipping",
    spine: "Readiness",
    note: "Captured, Written, Dressed, Aimed, Scheduled, Out. Each column states its gate, and a card that cannot pass one says why on its face: no media, no account, no time, account went quiet. Drafts are not a place — they are the cards short of Scheduled. Assets are what Dressed consumes. Analytics is the last column, because a card keeps its identity after it goes out and simply grows numbers.",
    screens: [
      { id: "board", name: "Board", render: pipelineBoard },
      { id: "card", name: "One piece", render: pipelineCard },
      { id: "schedule", name: "Schedule", render: pipelineSchedule },
      { id: "assets", name: "Assets", render: pipelineAssets },
      { id: "results", name: "Out", render: pipelineResults },
    ],
  },
  {
    id: "almanac", n: "F5", name: "Almanac", blurb: "Time · one axis, past and future",
    spine: "Time",
    note: "One time axis with the present fixed on it. Scroll down into what is planned, scroll up into what happened — with what each piece earned sitting on the piece itself. There is no analytics screen by construction: the split between \"what I posted\" and \"what it did\" is the thing every scheduler gets wrong. Undated work waits in the Well until it is dropped onto a day, and a Season page closes each month.",
    screens: [
      { id: "timeline", name: "Now", render: almanacTimeline },
      { id: "month", name: "Month", render: almanacMonth },
      { id: "well", name: "The well", render: almanacWell },
      { id: "season", name: "Season", render: almanacSeason },
      { id: "tracks", name: "Tracks", render: almanacTracks },
    ],
  },
];
