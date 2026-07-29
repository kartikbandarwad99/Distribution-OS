/* ───────────────────────────────────────────────────────────────────────────
   Direction lab — harness.

   Three axes. A THEME is a stylesheet; a FLOW is a whole application with its
   own information architecture; a SCREEN is one surface inside that flow. Any
   theme renders any screen of any flow, so 6 × 27 = 162 combinations come from
   six CSS files and twenty-seven renderers rather than a hundred and sixty-two
   designs.

   Each axis can be exploded on its own: all themes for one screen, all flows
   for a comparable screen, or all screens of one flow — which is the view that
   answers "is this direction actually a complete product?"

   Tunable tokens live here, not in the stylesheets, so the panel's defaults and
   the rendered defaults cannot drift apart. Every control knows its shipped
   value, marks it on the track, and can be put back — individually, per group,
   or all at once.
   ─────────────────────────────────────────────────────────────────────────── */

import { FLOWS, esc } from "./flows.js";

export const THEMES = [
  { id: "t1", n: "T1", name: "Aluminium", blurb: "The Mac canon, played straight",
    note: "System stack, cool neutrals, one system blue, vibrancy behind the rails, hairlines, and shadow only where a real surface sits above another. The control: a theme that cannot beat a well-built native Mac app is decoration." },
  { id: "t2", n: "T2", name: "Print-Tech", blurb: "Cool stock, spot ink, no light",
    note: "Deliberately not the cream-and-serif rendition, which is the exact look impeccable flags as the first AI cluster. Cool bright stock, hairline keylines around everything, mono field labels, one spot red, crop marks at the trim. Zero shadow — a printed sheet has no light source." },
  { id: "t3", n: "T3", name: "Data-Texture", blurb: "The content is the pattern",
    note: "Nothing decorative supplies the texture; the density of real rows does. Tiny tabular type, a continuous hairline lattice, mono numerals, rows at terminal pitch. An empty timeline cell shows as hatching, because absence is data too." },
  { id: "t4", n: "T4", name: "Vast Quiet", blurb: "Space is the material",
    note: "Almost no rules, no fills, no shadows — structure comes from distance alone. Type runs large and light with long leading and the accent appears maybe twice a screen. The bet: for a tool used in short bursts all day, calm beats density." },
  { id: "t5", n: "T5", name: "Dither Mono", blurb: "1-bit, and Mac to the bone",
    note: "Two inks and no third. Every grey is a dither pattern rather than a tint, because a 1-bit display has no greys — which also makes this the most literally Macintosh thing here. Hard borders, zero radius, selection is a full invert, media is a bayer halftone." },
  { id: "t6", n: "T6", name: "Classical", blurb: "Book typography, Mac chrome",
    note: "Refuses the serif-on-cream default on three counts: the stock is cool grey-white, the serif is a text face at reading size with old-style figures rather than a display face blown up, and the red is rubrication — marks and numbers only, never a button fill." },
];

/* ── tunable tokens ───────────────────────────────────────────────────────── */

const SWATCH = {
  accent: {
    t1: ["#0A6CFF", "#147EFB", "#3A7D44", "#B54708", "#7A3DB8", "#C4314B"],
    t2: ["#E2231A", "#0F5FD0", "#111111", "#0E7C5A", "#D06A00", "#6B21A8"],
    t3: ["#0B7285", "#0E9F6E", "#B4471F", "#1E4FA8", "#111111", "#8A5A00"],
    t4: ["#2F6DF6", "#111111", "#7A6A55", "#3D7A5C", "#A03A3A", "#5B4FBE"],
    t5: ["#000000", "#111111", "#1B2A1B", "#241B1B", "#0B1B2A"],
    t6: ["#A3271E", "#1F3A6E", "#111111", "#6B4A17", "#4A5A2E", "#7A2352"],
  },
  ink: {
    t1: ["#1D1D1F", "#000000", "#2C2C2E", "#1A2233", "#3A3A3C"],
    t2: ["#141618", "#000000", "#1E2226", "#0F1A2E", "#2A2E33"],
    t3: ["#111417", "#000000", "#0D1B1E", "#1A1D22", "#232323"],
    t4: ["#26262A", "#111111", "#3A3A40", "#1E2530", "#000000"],
    t5: ["#000000", "#111111", "#0B1B2A", "#1B2A1B", "#241B1B"],
    t6: ["#20222A", "#111111", "#2B2E38", "#1A2030", "#000000"],
  },
  ground: {
    t1: ["#F2F2F7", "#FFFFFF", "#ECECF0", "#E8EAF0", "#1C1C1E"],
    t2: ["#F4F4F1", "#FFFFFF", "#EDEEEA", "#F7F7F5", "#E9EAE6"],
    t3: ["#FBFBFA", "#FFFFFF", "#F4F5F4", "#EEF1F1", "#12171A"],
    t4: ["#FAFAF8", "#FFFFFF", "#F4F4F0", "#F6F7F9", "#111113"],
    t5: ["#FFFFFF", "#F7F7F2", "#EDEDE6", "#FFFEF8", "#000000"],
    t6: ["#F7F7F4", "#FFFFFF", "#F1F1EE", "#EFF1F2", "#15161A"],
  },
  raised: {
    t1: ["#FFFFFF", "#FAFAFC", "#F7F7FA", "#2C2C2E"],
    t2: ["#FFFFFF", "#FAFAF8", "#F8F9F7", "#EFEFEC"],
    t3: ["#FFFFFF", "#FCFDFD", "#F7F9F9", "#171D20"],
    t4: ["#FFFFFF", "#FDFDFB", "#F8F8F5", "#18181B"],
    t5: ["#FFFFFF", "#F7F7F2", "#FFFEF8", "#000000"],
    t6: ["#FFFFFF", "#FCFCFA", "#F8F8F6", "#1B1C21"],
  },
  "side-bg": {
    t1: ["#E9E9EF", "#F2F2F7", "#FFFFFF", "#DFDFE7", "#232326"],
    t2: ["#EEEFEB", "#F4F4F1", "#FFFFFF", "#E6E7E2"],
    t3: ["#F3F5F5", "#FBFBFA", "#FFFFFF", "#EAEDED"],
    t4: ["#FAFAF8", "#FFFFFF", "#F4F4F0", "#EFEFEB"],
    t5: ["#FFFFFF", "#F7F7F2", "#EDEDE6", "#000000"],
    t6: ["#F2F2EF", "#F7F7F4", "#FFFFFF", "#EAEAE6"],
  },
  "deck-bg": {
    "*": ["#101012", "#1C1C20", "#2E2E34", "#5A5A62", "#8A8A92", "#C9C9CF", "#FFFFFF"],
  },
};

const DEFAULTS = {
  t1: { accent: "#0A6CFF", ink: "#1D1D1F", ground: "#F2F2F7", raised: "#FFFFFF", "side-bg": "#E9E9EF",
        "rule-a": 0.11, radius: 7, "ui-size": 13, scale: 1.16, track: 0, "side-w": 250, "list-w": 392,
        "row-pad": 11, "bar-h": 53, elev: 0.6, grain: 0, vibrancy: 24, motion: 1, dur: 1, sel: "fill", num: "tabular" },
  t2: { accent: "#E2231A", ink: "#141618", ground: "#F4F4F1", raised: "#FFFFFF", "side-bg": "#EEEFEB",
        "rule-a": 0.7, radius: 0, "ui-size": 12.5, scale: 1.2, track: 0, "side-w": 248, "list-w": 400,
        /* A keyline box is native to print; a coloured tab is not. */
        "row-pad": 10, "bar-h": 52, elev: 0, grain: 0.06, vibrancy: 0, motion: 1, dur: 1, sel: "outline", num: "tabular" },
  t3: { accent: "#0B7285", ink: "#111417", ground: "#FBFBFA", raised: "#FFFFFF", "side-bg": "#F3F5F5",
        "rule-a": 0.55, radius: 2, "ui-size": 11, scale: 1.18, track: 0, "side-w": 224, "list-w": 430,
        /* A selected row in a data table is filled, not tabbed. */
        "row-pad": 6, "bar-h": 44, elev: 0, grain: 0, vibrancy: 0, motion: 1, dur: 1, sel: "fill", num: "tabular" },
  t4: { accent: "#2F6DF6", ink: "#26262A", ground: "#FAFAF8", raised: "#FFFFFF", "side-bg": "#FAFAF8",
        "rule-a": 0.34, radius: 6, "ui-size": 14, scale: 1.34, track: -0.004, "side-w": 264, "list-w": 424,
        "row-pad": 13, "bar-h": 64, elev: 0, grain: 0, vibrancy: 0, motion: 1, dur: 1.2, sel: "rail", num: "proportional" },
  t5: { accent: "#000000", ink: "#000000", ground: "#FFFFFF", raised: "#FFFFFF", "side-bg": "#FFFFFF",
        "rule-a": 1, radius: 0, "ui-size": 12.5, scale: 1.22, track: 0, "side-w": 240, "list-w": 396,
        "row-pad": 9, "bar-h": 50, elev: 0, grain: 0, vibrancy: 0, motion: 1, dur: 1, sel: "invert", num: "tabular" },
  t6: { accent: "#A3271E", ink: "#20222A", ground: "#F7F7F4", raised: "#FFFFFF", "side-bg": "#F2F2EF",
        "rule-a": 0.4, radius: 4, "ui-size": 13, scale: 1.26, track: 0, "side-w": 254, "list-w": 408,
        "row-pad": 12, "bar-h": 56, elev: 0.2, grain: 0.04, vibrancy: 0, motion: 1, dur: 1.1, sel: "rail", num: "proportional" },
};

const DECK_DEFAULT = "#101012";

const SCHEMA = [
  { group: "Surfaces", rows: [
    { k: "ground",   t: "swatch", label: "App background" },
    { k: "raised",   t: "swatch", label: "Panel surface" },
    { k: "side-bg",  t: "swatch", label: "Sidebar / rail" },
    { k: "deck-bg",  t: "swatch", label: "Behind the window", global: true },
  ]},
  { group: "Ink & accent", rows: [
    { k: "ink",    t: "swatch", label: "Ink" },
    { k: "accent", t: "swatch", label: "Accent" },
    { k: "rule-a", t: "range", label: "Rule strength", min: 0, max: 1, step: 0.01, fmt: (v) => (+v).toFixed(2) },
  ]},
  { group: "Type", rows: [
    { k: "ui-size", t: "range", label: "Base size", min: 10, max: 17, step: 0.5, unit: "px" },
    { k: "scale",   t: "range", label: "Scale ratio", min: 1.05, max: 1.45, step: 0.01, fmt: (v) => (+v).toFixed(2) },
    { k: "track",   t: "range", label: "Tracking", min: -0.04, max: 0.06, step: 0.002, fmt: (v) => `${(+v).toFixed(3)}em` },
    { k: "num",     t: "select", label: "Numerals", opts: ["tabular", "proportional"] },
  ]},
  { group: "Layout", rows: [
    { k: "side-w",  t: "range", label: "Sidebar width", min: 190, max: 330, step: 2, unit: "px" },
    { k: "list-w",  t: "range", label: "List column", min: 320, max: 500, step: 4, unit: "px" },
    { k: "row-pad", t: "range", label: "Row density", min: 4, max: 22, step: 1, unit: "px" },
    { k: "bar-h",   t: "range", label: "Toolbar height", min: 38, max: 74, step: 1, unit: "px" },
    { k: "radius",  t: "range", label: "Corner radius", min: 0, max: 20, step: 1, unit: "px" },
  ]},
  { group: "Material", rows: [
    { k: "elev",     t: "range", label: "Elevation", min: 0, max: 1.6, step: 0.05, fmt: (v) => (+v).toFixed(2) },
    { k: "grain",    t: "range", label: "Grain", min: 0, max: 1, step: 0.02, fmt: (v) => (+v).toFixed(2) },
    { k: "vibrancy", t: "range", label: "Rail blur", min: 0, max: 44, step: 1, unit: "px", only: ["t1"] },
    { k: "sel",      t: "select", label: "Selection", opts: ["fill", "rail", "outline", "invert"] },
  ]},
  { group: "Motion", rows: [
    { k: "motion", t: "toggle", label: "Motion" },
    { k: "dur",    t: "range", label: "Duration ×", min: 0.4, max: 2.2, step: 0.05, fmt: (v) => `${(+v).toFixed(2)}×` },
  ]},
];

const ALL_ROWS = SCHEMA.flatMap((g) => g.rows);
const rowFor = (k) => ALL_ROWS.find((r) => r.k === k);
const NUMERIC = new Set(ALL_ROWS.filter((r) => r.t === "range" || r.t === "toggle").map((r) => r.k));
const PX = new Set(["radius", "ui-size", "side-w", "list-w", "row-pad", "bar-h", "vibrancy"]);

/* ── state ────────────────────────────────────────────────────────────────── */

const STORE = "distribution-lab:v2";
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ tweaks: state.tweaks, deck: state.deck })); } catch { /* private mode */ } };

const saved = load();
const state = {
  theme: "t1",
  flow: "classic",
  /* one remembered screen per flow, so switching flows and coming back does
     not dump you at the home screen every time */
  screens: Object.fromEntries(FLOWS.map((f) => [f.id, f.screens[0].id])),
  all: false,
  allAxis: "theme",   /* theme | flow | screen */
  drawer: false,
  deck: saved.deck ?? DECK_DEFAULT,
  tweaks: {},
};

const flowOf = (id) => FLOWS.find((f) => f.id === id);
const screenOf = (flowId, screenId) => {
  const f = flowOf(flowId);
  return f.screens.find((s) => s.id === screenId) ?? f.screens[0];
};
/* When cycling flows, land on the screen that matches by name where one exists
   (Assets next to Assets), otherwise the flow's home screen. */
const comparableScreen = (flowId, wantName) => {
  const f = flowOf(flowId);
  const hit = f.screens.find((s) => s.name.toLowerCase() === String(wantName).toLowerCase());
  return (hit ?? f.screens.find((s) => s.id === state.screens[flowId]) ?? f.screens[0]).id;
};
for (const t of THEMES) state.tweaks[t.id] = { ...DEFAULTS[t.id], ...(saved.tweaks?.[t.id] ?? {}) };

const deck = document.getElementById("deck");
const drawer = document.getElementById("drawer");
const dbody = document.getElementById("dbody");
const dtitle = document.getElementById("dtitle");

const isDirty = (id, k) => String(state.tweaks[id][k]) !== String(DEFAULTS[id][k]);
const themeDirty = (id) => Object.keys(DEFAULTS[id]).some((k) => isDirty(id, k));

/* ── apply ────────────────────────────────────────────────────────────────── */

function applyTokens(stage, id) {
  const t = state.tweaks[id];
  for (const [k, raw] of Object.entries(t)) {
    let v = raw;
    if (k === "track") v = `${raw}em`;
    else if (PX.has(k)) v = `${raw}px`;
    else if (NUMERIC.has(k)) v = String(raw);
    stage.style.setProperty(`--${k}`, v);
  }
  stage.dataset.sel = t.sel;
  stage.dataset.motion = t.motion ? "on" : "off";
  stage.dataset.num = t.num;
}

/* ── render ───────────────────────────────────────────────────────────────── */

const W = 1360, H = 860;

function render() {
  document.body.style.setProperty("--deck-bg", state.deck);
  const here = state.screens[state.flow];

  let list;
  if (!state.all) {
    list = [{ theme: state.theme, flow: state.flow, screen: here }];
  } else if (state.allAxis === "theme") {
    list = THEMES.map((t) => ({ theme: t.id, flow: state.flow, screen: here }));
  } else if (state.allAxis === "screen") {
    list = flowOf(state.flow).screens.map((s) => ({ theme: state.theme, flow: state.flow, screen: s.id }));
  } else {
    const wantName = screenOf(state.flow, here).name;
    list = FLOWS.map((f) => ({ theme: state.theme, flow: f.id, screen: comparableScreen(f.id, wantName) }));
  }

  deck.dataset.mode = state.all ? "all" : "single";
  deck.innerHTML = list.map(({ theme, flow, screen }) => {
    const t = THEMES.find((x) => x.id === theme), f = flowOf(flow), s = screenOf(flow, screen);
    const cap = state.allAxis === "theme" ? `<b>${t.n}</b> ${esc(t.name)} <em>${esc(t.blurb)}</em>`
      : state.allAxis === "screen" ? `<b>${esc(s.name)}</b> <em>${esc(f.name)}</em>`
      : `<b>${f.n}</b> ${esc(f.name)} <em>${esc(s.name)} · ${esc(f.spine)}</em>`;
    return `<div class="slot" data-theme="${theme}" data-flow="${flow}" data-scr="${screen}">
      <div class="stage" data-theme="${theme}" style="width:${W}px;height:${H}px">${s.render()}</div>
      <div class="slotcap">${cap}</div>
    </div>`;
  }).join("");

  for (const el of deck.querySelectorAll(".stage")) applyTokens(el, el.dataset.theme);

  if (state.all) {
    for (const slot of deck.querySelectorAll(".slot")) {
      slot.addEventListener("click", () => {
        state.theme = slot.dataset.theme;
        state.flow = slot.dataset.flow;
        state.screens[slot.dataset.flow] = slot.dataset.scr;
        state.all = false;
        syncChrome(); render(); if (state.drawer) buildPanel();
      });
    }
  }
  fit();
}

function fit() {
  const slots = [...deck.querySelectorAll(".slot")];
  if (!slots.length) return;
  const pad = state.all ? 24 : 30;
  const availW = deck.clientWidth - pad * 2;
  const availH = deck.clientHeight - pad * 2;

  let s;
  if (state.all) {
    let cols = 3, best = 0;
    for (const c of [2, 3, 4, 5]) {
      const rows = Math.ceil(slots.length / c);
      const trial = Math.min((availW / c - 22) / W, (availH / rows - 44) / H);
      if (trial > best) { best = trial; cols = c; }
    }
    s = best; deck.style.setProperty("--cols", cols);
  } else {
    s = Math.min(availW / W, availH / H, 1);
  }
  s = Math.max(0.12, s);
  for (const slot of slots) {
    slot.style.setProperty("--s", s);
    slot.style.width = `${W * s}px`;
    slot.style.height = `${H * s + (state.all ? 24 : 0)}px`;
  }
}

/* ── tweak panel ──────────────────────────────────────────────────────────── */

const pct = (r, v) => (Number(v) - r.min) / (r.max - r.min);

function buildPanel() {
  const id = state.theme;
  const t = THEMES.find((x) => x.id === id);
  const f = flowOf(state.flow);
  const sc = screenOf(state.flow, state.screens[state.flow]);
  const vals = state.tweaks[id];
  dtitle.innerHTML = `${t.n} · ${esc(t.name)}`;
  document.getElementById("ddirty").hidden = !themeDirty(id);

  const ctl = (r) => {
    const global = r.global === true;
    const val = global ? state.deck : vals[r.k];
    const def = global ? DECK_DEFAULT : DEFAULTS[id][r.k];
    const dirty = String(val) !== String(def);
    const head = `<label>${r.label}</label><output${r.t === "range" ? ` data-out="${r.k}"` : ""}>${
      r.t === "range" ? (r.fmt ? r.fmt(val) : `${val}${r.unit || ""}`)
      : r.t === "toggle" ? (val ? "ON" : "OFF") : String(val).toUpperCase()
    }</output><button class="revert" data-revert="${r.k}" title="Back to ${def}">⟲</button>`;

    if (r.t === "swatch") {
      const list = SWATCH[r.k][global ? "*" : id];
      const shown = list.includes(String(def)) ? list : [def, ...list];
      return `<div class="row" data-dirty="${dirty ? 1 : 0}">${head}
        <div class="sw">${shown.map((c) => `<button class="chipc${String(c).toLowerCase() === String(val).toLowerCase() ? " on" : ""}${String(c).toLowerCase() === String(def).toLowerCase() ? " def" : ""}" data-k="${r.k}" data-v="${c}" style="--c:${c}" title="${c}${String(c).toLowerCase() === String(def).toLowerCase() ? " · default" : ""}"></button>`).join("")}
        <input type="color" class="pick" data-k="${r.k}" value="${val}" title="Pick a colour"></div></div>`;
    }
    if (r.t === "range") {
      return `<div class="row" data-dirty="${dirty ? 1 : 0}">${head}
        <div class="rangewrap">
          <input type="range" data-k="${r.k}" min="${r.min}" max="${r.max}" step="${r.step}" value="${val}">
          <i class="defmark" style="--p:${pct(r, def)}" title="Default ${def}"></i>
        </div></div>`;
    }
    if (r.t === "toggle") {
      return `<div class="row" data-dirty="${dirty ? 1 : 0}">${head}
        <div class="tg"><button data-k="${r.k}" data-v="0" class="${val ? "" : "on"}">off</button><button data-k="${r.k}" data-v="1" class="${val ? "on" : ""}">on</button></div></div>`;
    }
    return `<div class="row" data-dirty="${dirty ? 1 : 0}">${head}
      <select data-k="${r.k}">${r.opts.map((o) => `<option${o === val ? " selected" : ""}>${o}${o === def ? " (default)" : ""}</option>`).join("")}</select></div>`;
  };

  dbody.innerHTML =
    `<p class="dnote"><b>${esc(f.name)} — spine: ${esc(f.spine.toLowerCase())}.</b> ${esc(f.note)}</p>` +
    `<p class="dnote screens"><b>${f.screens.length} screens.</b> ${f.screens.map((s) =>
      `<em${s.id === sc.id ? ' class="on"' : ""}>${esc(s.name)}</em>`).join("")}</p>` +
    `<p class="dnote"><b>${esc(t.name)}.</b> ${esc(t.note)}</p>` +
    SCHEMA.map((g) => {
      const rows = g.rows.filter((r) => !r.only || r.only.includes(id));
      if (!rows.length) return "";
      const anyDirty = rows.some((r) => r.global ? state.deck !== DECK_DEFAULT : isDirty(id, r.k));
      return `<section class="grp" data-group="${g.group}">
        <div class="grph"><h4>${g.group}</h4><button class="greset" data-groupreset="${g.group}"${anyDirty ? "" : " hidden"}>reset</button></div>
        ${rows.map(ctl).join("")}</section>`;
    }).join("");
}

function setToken(k, v) {
  if (k === "deck-bg") { state.deck = v; document.body.style.setProperty("--deck-bg", v); persist(); return; }
  const id = state.theme;
  state.tweaks[id][k] = NUMERIC.has(k) ? Number(v) : v;
  persist();
  for (const el of deck.querySelectorAll(`.stage[data-theme="${id}"]`)) applyTokens(el, id);
}

/* Live drag: update the value and its readout only, so the panel does not
   rebuild under the pointer and drop the drag. */
dbody.addEventListener("input", (e) => {
  const el = e.target.closest("[data-k]");
  if (!el) return;
  const k = el.dataset.k;
  if (el.type === "range") {
    setToken(k, el.value);
    const r = rowFor(k);
    const out = dbody.querySelector(`[data-out="${k}"]`);
    if (out) out.textContent = r.fmt ? r.fmt(el.value) : `${el.value}${r.unit || ""}`;
    markDirty(el, k);
  } else if (el.type === "color") {
    setToken(k, el.value);
    markDirty(el, k);
  } else if (el.tagName === "SELECT") {
    setToken(k, el.value); buildPanel();
  }
});
dbody.addEventListener("change", (e) => {
  if (e.target.type === "color") buildPanel();
});

function markDirty(el, k) {
  const row = el.closest(".row");
  const def = k === "deck-bg" ? DECK_DEFAULT : DEFAULTS[state.theme][k];
  const val = k === "deck-bg" ? state.deck : state.tweaks[state.theme][k];
  row.dataset.dirty = String(val) === String(def) ? "0" : "1";
  const grp = el.closest(".grp");
  grp.querySelector(".greset").hidden = !grp.querySelector('.row[data-dirty="1"]');
  document.getElementById("ddirty").hidden = !themeDirty(state.theme);
}

dbody.addEventListener("click", (e) => {
  const rev = e.target.closest("[data-revert]");
  if (rev) {
    const k = rev.dataset.revert;
    setToken(k, k === "deck-bg" ? DECK_DEFAULT : DEFAULTS[state.theme][k]);
    buildPanel(); return;
  }
  const gr = e.target.closest("[data-groupreset]");
  if (gr) {
    const g = SCHEMA.find((x) => x.group === gr.dataset.groupreset);
    for (const r of g.rows) setToken(r.k, r.global ? DECK_DEFAULT : DEFAULTS[state.theme][r.k]);
    buildPanel(); toast(`${g.group} reset`); return;
  }
  const b = e.target.closest("button[data-k]");
  if (b) { setToken(b.dataset.k, b.dataset.v); buildPanel(); }
});

/* ── Copy CSS ─────────────────────────────────────────────────────────────── */

function cssBlock() {
  const id = state.theme;
  const t = THEMES.find((x) => x.id === id);
  const v = state.tweaks[id];
  return `/* ═══════════════════════════════════════════════════════════
   ${t.name.toUpperCase()} — ${t.blurb}
   Exported from public/lab/index.html on ${new Date().toISOString().slice(0, 10)}.
   Paste over the :root block in src/styles/tokens.css.
   ═══════════════════════════════════════════════════════════ */
:root {
  --ground: ${v.ground};          /* window canvas */
  --raised: ${v.raised};          /* panes, cards, popovers */
  --side-bg: ${v["side-bg"]};     /* sidebar and rails */
  --ink: ${v.ink};
  --ink-2: color-mix(in srgb, var(--ink) 62%, var(--ground));
  --ink-3: color-mix(in srgb, var(--ink) 42%, var(--ground));
  --ink-4: color-mix(in srgb, var(--ink) 26%, var(--ground));

  --accent: ${v.accent};          /* the single accent */
  --rule-a: ${v["rule-a"]};
  --rule:   color-mix(in srgb, var(--ink) calc(var(--rule-a) * 22%), transparent);
  --rule-2: color-mix(in srgb, var(--ink) calc(var(--rule-a) * 46%), transparent);

  --ui-size: ${v["ui-size"]}px;
  --scale: ${v.scale};
  --track: ${v.track}em;
  --num: ${v.num};

  --side-w: ${v["side-w"]}px;
  --list-w: ${v["list-w"]}px;
  --row-pad: ${v["row-pad"]}px;
  --bar-h: ${v["bar-h"]}px;
  --radius: ${v.radius}px;

  --elev: ${v.elev};
  --grain: ${v.grain};
  --vibrancy: ${v.vibrancy}px;
  --lift: 0 1px 2px rgb(0 0 0 / calc(var(--elev) * .09)), 0 6px 18px -6px rgb(0 0 0 / calc(var(--elev) * .22));
  --pop:  0 2px 6px rgb(0 0 0 / calc(var(--elev) * .13)), 0 22px 48px -14px rgb(0 0 0 / calc(var(--elev) * .45));

  --dur: ${v.dur};
  --selection: ${v.sel};
  color-scheme: light;
}
`;
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2200);
}

document.getElementById("copycss").addEventListener("click", async () => {
  const css = cssBlock();
  try { await navigator.clipboard.writeText(css); toast("CSS copied — paste over :root in tokens.css"); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = css; document.body.append(ta); ta.select();
    document.execCommand("copy"); ta.remove(); toast("CSS copied");
  }
});

document.getElementById("resetcss").addEventListener("click", () => {
  state.tweaks[state.theme] = { ...DEFAULTS[state.theme] };
  state.deck = DECK_DEFAULT;
  persist(); buildPanel(); render();
  toast(`${THEMES.find((t) => t.id === state.theme).name} back to defaults`);
});

/* ── chrome ───────────────────────────────────────────────────────────────── */

const tabs = document.getElementById("tabs");
tabs.innerHTML = THEMES.map((t) => `<button class="labtab" data-t="${t.id}"><b>${t.n}</b><span>${esc(t.name)}</span></button>`).join("");

const ftabs = document.getElementById("ftabs");
ftabs.innerHTML = FLOWS.map((f) => `<button class="flowtab" data-f="${f.id}"><b>${f.n}</b><span>${esc(f.name)}</span><em>${esc(f.blurb)}</em></button>`).join("");

const stabs = document.getElementById("stabs");
const spinelab = document.getElementById("spinelab");

function buildScreenTabs() {
  const f = flowOf(state.flow);
  spinelab.innerHTML = `Screen <em>spine: ${esc(f.spine.toLowerCase())}</em>`;
  stabs.innerHTML = f.screens.map((s, i) =>
    `<button class="scrtab" data-s="${s.id}"><b>${i + 1}</b><span>${esc(s.name)}</span></button>`).join("");
}

function syncChrome() {
  for (const b of tabs.children) b.classList.toggle("on", b.dataset.t === state.theme && !(state.all && state.allAxis === "theme"));
  for (const b of ftabs.children) b.classList.toggle("on", b.dataset.f === state.flow && !(state.all && state.allAxis === "flow"));
  for (const b of stabs.children) b.classList.toggle("on", b.dataset.s === state.screens[state.flow] && !(state.all && state.allAxis === "screen"));

  document.getElementById("allthemes").classList.toggle("on", state.all && state.allAxis === "theme");
  document.getElementById("allflows").classList.toggle("on", state.all && state.allAxis === "flow");
  document.getElementById("allscreens").classList.toggle("on", state.all && state.allAxis === "screen");
  const tb = document.getElementById("tweakbtn");
  tb.classList.toggle("on", state.drawer);
  drawer.hidden = !state.drawer;
  document.body.dataset.drawer = state.drawer ? "on" : "off";
}

const commit = () => { syncChrome(); render(); if (state.drawer) buildPanel(); };

tabs.addEventListener("click", (e) => {
  const b = e.target.closest("[data-t]"); if (!b) return;
  state.theme = b.dataset.t;
  if (state.all && state.allAxis === "theme") state.all = false;
  commit();
});
ftabs.addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]"); if (!b) return;
  setFlow(b.dataset.f);
  if (state.all && state.allAxis === "flow") state.all = false;
  commit();
});
stabs.addEventListener("click", (e) => {
  const b = e.target.closest("[data-s]"); if (!b) return;
  state.screens[state.flow] = b.dataset.s;
  if (state.all && state.allAxis === "screen") state.all = false;
  commit();
});

/* Switching flow keeps you on the comparable screen where one exists, so
   cycling F1–F5 on "Assets" compares five answers to the same question. */
function setFlow(id) {
  if (id === state.flow) return;
  const wantName = screenOf(state.flow, state.screens[state.flow]).name;
  state.flow = id;
  state.screens[id] = comparableScreen(id, wantName);
  buildScreenTabs();
}

const explode = (axis) => () => {
  state.all = !(state.all && state.allAxis === axis); state.allAxis = axis; syncChrome(); render();
};
document.getElementById("allthemes").addEventListener("click", explode("theme"));
document.getElementById("allflows").addEventListener("click", explode("flow"));
document.getElementById("allscreens").addEventListener("click", explode("screen"));

const toggleDrawer = () => {
  state.drawer = !state.drawer; syncChrome();
  if (state.drawer) buildPanel();
  fit();
};
document.getElementById("tweakbtn").addEventListener("click", toggleDrawer);
document.getElementById("dclose").addEventListener("click", toggleDrawer);

const FLOWKEY = { q: "classic", w: "studio", e: "channels", r: "pipeline", t: "almanac" };

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  const scr = flowOf(state.flow).screens;
  const at = scr.findIndex((s) => s.id === state.screens[state.flow]);

  if (k >= "1" && k <= "6") { state.theme = `t${k}`; if (state.allAxis === "theme") state.all = false; }
  else if (FLOWKEY[k]) { setFlow(FLOWKEY[k]); if (state.allAxis === "flow") state.all = false; }
  else if (e.key === "ArrowRight") { state.screens[state.flow] = scr[(at + 1) % scr.length].id; state.all = false; }
  else if (e.key === "ArrowLeft") { state.screens[state.flow] = scr[(at - 1 + scr.length) % scr.length].id; state.all = false; }
  else if (k === "g") { state.all = !(state.all && state.allAxis === "theme"); state.allAxis = "theme"; }
  else if (k === "f") { state.all = !(state.all && state.allAxis === "flow"); state.allAxis = "flow"; }
  else if (k === "a") { state.all = !(state.all && state.allAxis === "screen"); state.allAxis = "screen"; }
  else if (k === "y") { toggleDrawer(); e.preventDefault(); return; }
  else return;
  syncChrome(); render(); if (state.drawer) buildPanel();
  e.preventDefault();
});

addEventListener("resize", fit);
buildScreenTabs();
syncChrome();
render();
