/* ───────────────────────────────────────────────────────────────────────────
   Demonstration data for the direction lab.

   SYNTHETIC. Every project, account, handle, asset, post and number below is
   authored for design evaluation only. Nothing here is real, and no figure is a
   metric, benchmark, forecast or claim. It exists so five complete products can
   be judged against real-shaped content — the length, rhythm and raggedness of
   actual work is most of what a row, a tile or a chart has to survive.

   SCALE IS THE POINT. The roster is deliberately the one described by the
   owner: four Instagram accounts, three X accounts, two Medium accounts, plus
   LinkedIn and Threads. Eleven live accounts across five platforms, spread over
   three projects, with two personal handles that belong to every project. A
   direction that reads well at three accounts and falls apart at eleven has
   failed, and that failure has to be visible here.

   Vocabulary extends PRODUCT.md, by the owner's decision on 26 Jul 2026:
     platform  x | instagram | threads | linkedin | medium   (medium is new)
     kind      post | thread | carousel | reel | image | article | note
     status    idea | draft | scheduled | published | failed
   Analytics was a stated non-goal in PRODUCT.md and is now in scope; assets are
   promoted from an implementation detail to a first-class object.
   ─────────────────────────────────────────────────────────────────────────── */

/* ═══ projects ══════════════════════════════════════════════════════════════
   A project scopes accounts. A `global` account belongs to no project and
   appears in all of them — that is the personal voice that talks about
   everything. This is the whole targeting model; there is no separate "set"
   object, because project + global already describes how the owner works.
   ════════════════════════════════════════════════════════════════════════ */

export const PROJECTS = [
  { id: "validate",  name: "Validate",  mark: "V", tint: "#3B6FD4", accounts: 4, queued: 11 },
  { id: "fieldnote", name: "Fieldnote", mark: "F", tint: "#B4571F", accounts: 2, queued: 4 },
  { id: "harbor",    name: "Harbor",    mark: "H", tint: "#2E7D63", accounts: 1, queued: 2 },
];

export const CURRENT_PROJECT = PROJECTS[0];

/* ═══ accounts ═════════════════════════════════════════════════════════════ */

export const ACCOUNTS = [
  /* X — three handles */
  { id: "x1", platform: "x", handle: "@validateapp", name: "Validate", project: "validate",
    connected: true, health: "ok", followers: 4820, delta: +2.4, queued: 4, last: "2h ago",
    cadence: { target: 5, actual: 5 }, spark: [31, 38, 34, 52, 44, 61, 58], best: "09:30",
    reach7: 18400, eng7: 3.9 },
  { id: "x2", platform: "x", handle: "@kartikwrites", name: "Kartik", project: null,
    connected: true, health: "ok", followers: 11240, delta: +1.1, queued: 3, last: "yesterday",
    cadence: { target: 4, actual: 3 }, spark: [64, 58, 71, 66, 49, 72, 69], best: "14:15",
    reach7: 41200, eng7: 2.6 },
  { id: "x3", platform: "x", handle: "@fieldnoteco", name: "Fieldnote", project: "fieldnote",
    connected: true, health: "quiet", followers: 890, delta: -0.3, queued: 0, last: "11 days ago",
    cadence: { target: 3, actual: 0 }, spark: [12, 9, 14, 6, 4, 2, 0], best: "18:00",
    reach7: 640, eng7: 1.4 },

  /* Instagram — four handles */
  { id: "ig1", platform: "instagram", handle: "@validate.app", name: "Validate", project: "validate",
    connected: true, health: "ok", followers: 3110, delta: +4.8, queued: 5, last: "5h ago",
    cadence: { target: 4, actual: 4 }, spark: [22, 31, 28, 44, 39, 55, 63], best: "11:00",
    reach7: 12900, eng7: 6.2 },
  { id: "ig2", platform: "instagram", handle: "@fieldnote.co", name: "Fieldnote", project: "fieldnote",
    connected: false, health: "reauth", followers: 1740, delta: 0, queued: 2, last: "9 days ago",
    cadence: { target: 3, actual: 0 }, spark: [18, 21, 17, 12, 0, 0, 0], best: "12:30",
    reach7: 0, eng7: 0 },
  { id: "ig3", platform: "instagram", handle: "@harbor.tools", name: "Harbor", project: "harbor",
    connected: true, health: "quiet", followers: 620, delta: +0.6, queued: 2, last: "6 days ago",
    cadence: { target: 2, actual: 1 }, spark: [8, 11, 6, 9, 4, 5, 3], best: "19:00",
    reach7: 1480, eng7: 5.1 },
  { id: "ig4", platform: "instagram", handle: "@kartik.builds", name: "Kartik", project: null,
    connected: true, health: "ok", followers: 8460, delta: +3.2, queued: 3, last: "1d ago",
    cadence: { target: 4, actual: 4 }, spark: [48, 44, 59, 62, 51, 68, 74], best: "17:45",
    reach7: 29600, eng7: 7.4 },

  /* Medium — two publications */
  { id: "md1", platform: "medium", handle: "@kartikb", name: "Kartik B", project: null,
    connected: true, health: "ok", followers: 2280, delta: +0.9, queued: 1, last: "4 days ago",
    cadence: { target: 1, actual: 1 }, spark: [9, 14, 11, 8, 16, 12, 10], best: "Tue 09:00",
    reach7: 5400, eng7: 41 },
  { id: "md2", platform: "medium", handle: "Validate Engineering", name: "Validate Eng", project: "validate",
    connected: true, health: "quiet", followers: 410, delta: +0.2, queued: 0, last: "3 weeks ago",
    cadence: { target: 1, actual: 0 }, spark: [3, 2, 4, 1, 2, 0, 1], best: "Thu 08:00",
    reach7: 320, eng7: 38 },

  /* LinkedIn + Threads */
  { id: "li1", platform: "linkedin", handle: "in/kartikb", name: "Kartik B", project: null,
    connected: true, health: "ok", followers: 6900, delta: +1.8, queued: 2, last: "2d ago",
    cadence: { target: 2, actual: 2 }, spark: [26, 33, 29, 41, 37, 44, 48], best: "Mon 09:00",
    reach7: 15800, eng7: 4.4 },
  { id: "th1", platform: "threads", handle: "@validateapp", name: "Validate", project: "validate",
    connected: true, health: "ok", followers: 1290, delta: +5.6, queued: 2, last: "5h ago",
    cadence: { target: 4, actual: 3 }, spark: [11, 18, 15, 26, 22, 31, 36], best: "17:45",
    reach7: 4700, eng7: 5.8 },

  /* not yet connected */
  { id: "rd1", platform: "reddit", handle: "r/SideProject", name: "Reddit", project: null,
    connected: false, health: "off", followers: 0, delta: 0, queued: 0, last: "never",
    cadence: { target: 0, actual: 0 }, spark: [0, 0, 0, 0, 0, 0, 0], best: "—", soon: true,
    reach7: 0, eng7: 0 },
];

export const accountById = (id) => ACCOUNTS.find((a) => a.id === id);
export const LIVE = ACCOUNTS.filter((a) => !a.soon);
export const inProject = (p = CURRENT_PROJECT.id) => LIVE.filter((a) => a.project === p || a.project === null);

export const PLATFORMS = [
  { id: "x", label: "X", n: 3 },
  { id: "instagram", label: "Instagram", n: 4 },
  { id: "medium", label: "Medium", n: 2 },
  { id: "linkedin", label: "LinkedIn", n: 1 },
  { id: "threads", label: "Threads", n: 1 },
  { id: "reddit", label: "Reddit", n: 0 },
];

/* ═══ smart lists ══════════════════════════════════════════════════════════ */

export const SMART_LISTS = [
  { id: "queue",     label: "Queue",         count: 17, icon: "clock" },
  { id: "drafts",    label: "Drafts",        count: 9,  icon: "doc" },
  { id: "ideas",     label: "Ideas",         count: 12, icon: "spark" },
  { id: "longform",  label: "Long-form",     count: 5,  icon: "text" },
  { id: "assets",    label: "Assets",        count: 214, icon: "film" },
  { id: "published", label: "Published",     count: 342, icon: "check" },
];

/* ═══ the queue ════════════════════════════════════════════════════════════ */

export const QUEUE = [
  {
    day: "Today", stamp: "Sat 26 Jul",
    rows: [
      { id: "q1", time: "09:30", kind: "thread", parts: 5, targets: ["x1", "th1"], status: "scheduled", assets: 0,
        body: "Five things I got wrong about local-first before shipping one. Number two cost me a rewrite: I treated SQLite as a cache instead of the actual source of truth, and every sync bug after that was downstream of that one decision." },
      { id: "q2", time: "11:00", kind: "carousel", parts: 8, targets: ["ig1"], status: "scheduled", assets: 8,
        body: "The eight screens of Validate, annotated. Swipe for the ones that got cut and why." },
      { id: "q3", time: "14:15", kind: "post", parts: 1, targets: ["x2"], status: "scheduled", assets: 0,
        body: "Shipping is a design constraint. Every week you don't ship, the thing you're building drifts a little further from the thing anyone wanted." },
      { id: "q4", time: "17:45", kind: "reel", parts: 1, targets: ["ig4", "th1"], status: "scheduled", assets: 1, duration: "0:42",
        body: "42 seconds: dragging a post across the calendar and watching the notification reschedule itself." },
      { id: "q5", time: "19:00", kind: "post", parts: 1, targets: ["x1"], status: "failed", assets: 0, flag: "Failed",
        body: "Meta app review is the reason your scheduler has a Copy button instead of an API key." },
    ],
  },
  {
    day: "Tomorrow", stamp: "Sun 27 Jul",
    rows: [
      { id: "q6", time: "08:00", kind: "post", parts: 1, targets: ["x2", "li1"], status: "scheduled", assets: 1,
        body: "Sunday reading: the Vignelli transit diagram is still the best argument that a schedule is a shape, not a list." },
      { id: "q7", time: "12:30", kind: "image", parts: 1, targets: ["ig4"], status: "scheduled", assets: 1,
        body: "Desk, 7am, third coffee. The calendar view finally stopped collapsing into a sliver." },
      { id: "q8", time: "16:00", kind: "thread", parts: 3, targets: ["x1"], status: "scheduled", assets: 0,
        body: "A short thread on why I stopped writing captions in the app that publishes them." },
    ],
  },
  {
    day: "Monday", stamp: "Mon 28 Jul",
    rows: [
      { id: "q9", time: "09:00", kind: "article", parts: 1, targets: ["md1", "li1"], status: "scheduled", assets: 1, words: 2140,
        body: "Local-first is a promise, not a stack detail — the long version, finally finished." },
      { id: "q10", time: "13:00", kind: "carousel", parts: 6, targets: ["ig1", "th1"], status: "scheduled", assets: 6,
        body: "Six tile shapes, one grid. How Library stopped feeling dead." },
      { id: "q11", time: "18:30", kind: "post", parts: 1, targets: ["ig3"], status: "scheduled", assets: 1,
        body: "Harbor's changelog is now a single markdown file and a cron job. That is the whole release process." },
    ],
  },
  {
    day: "No time yet", stamp: "6 items",
    rows: [
      { id: "q12", time: null, kind: "post", parts: 1, targets: ["x2"], status: "draft", assets: 0, flag: "Needs a time",
        body: "Nobody asks how many columns your app has until it has four." },
      { id: "q13", time: null, kind: "note", parts: 1, targets: [], status: "idea", assets: 0,
        body: "Idea — a departure board for the week. Posts leave from gates. Accounts are destinations." },
      { id: "q14", time: null, kind: "thread", parts: 4, targets: ["x1"], status: "draft", assets: 0, flag: "Needs a time",
        body: "Draft: the manual-publish decision, and why it shipped on day one instead of never." },
      { id: "q15", time: null, kind: "carousel", parts: 0, targets: ["ig2"], status: "draft", assets: 0, flag: "No media",
        body: "Fieldnote's field guide, ten slides. Caption written, slides not made." },
    ],
  },
];

/* ═══ assets ═══════════════════════════════════════════════════════════════
   Video, stills and multi-image sets. An asset is not a post: it has no
   destination and no time. `usedIn` is the number of published pieces that
   drew on it, which is the number that decides whether to reuse it.
   ════════════════════════════════════════════════════════════════════════ */

export const ASSET_FOLDERS = [
  { id: "all",     label: "All assets",   count: 214 },
  { id: "launch",  label: "Launch week",  count: 38 },
  { id: "screens", label: "Screens",      count: 61 },
  { id: "studio",  label: "Desk & studio", count: 24 },
  { id: "footage", label: "Raw footage",  count: 52 },
  { id: "unsorted", label: "Unsorted",    count: 39, warn: true },
];

export const ASSETS = [
  { id: "as1", type: "video", title: "Drag to reschedule", ratio: "9/16", dur: "0:42", size: "38 MB",
    folder: "footage", date: "24 Jul", usedIn: 2, reach: 9400, tone: 1, tags: ["screencap", "calendar"] },
  { id: "as2", type: "set", title: "Eight screens, annotated", ratio: "4/5", count: 8, size: "14 MB",
    folder: "screens", date: "23 Jul", usedIn: 1, reach: 12100, tone: 2, tags: ["carousel", "launch"] },
  { id: "as3", type: "photo", title: "Desk, 7am", ratio: "3/2", size: "6.1 MB",
    folder: "studio", date: "22 Jul", usedIn: 3, reach: 7800, tone: 3, tags: ["desk", "warm"] },
  { id: "as4", type: "photo", title: "Grain test", ratio: "1/1", size: "4.4 MB",
    folder: "studio", date: "21 Jul", usedIn: 0, reach: 0, tone: 5, tags: ["texture"] },
  { id: "as5", type: "video", title: "Composer, end to end", ratio: "9/16", dur: "1:08", size: "71 MB",
    folder: "footage", date: "20 Jul", usedIn: 1, reach: 5200, tone: 6, tags: ["screencap"] },
  { id: "as6", type: "set", title: "Six tile shapes", ratio: "4/5", count: 6, size: "9 MB",
    folder: "screens", date: "19 Jul", usedIn: 1, reach: 6600, tone: 7, tags: ["carousel", "library"] },
  { id: "as7", type: "photo", title: "Fieldnote, cover study", ratio: "3/4", size: "5.2 MB",
    folder: "launch", date: "18 Jul", usedIn: 0, reach: 0, tone: 8, tags: ["fieldnote", "cover"] },
  { id: "as8", type: "photo", title: "Calendar, month grid", ratio: "3/2", size: "3.8 MB",
    folder: "screens", date: "17 Jul", usedIn: 2, reach: 4100, tone: 9, tags: ["screenshot"] },
  { id: "as9", type: "video", title: "Notification fires", ratio: "16/9", dur: "0:16", size: "22 MB",
    folder: "footage", date: "16 Jul", usedIn: 1, reach: 3300, tone: 4, tags: ["screencap", "native"] },
  { id: "as10", type: "set", title: "Launch week, ten cards", ratio: "1/1", count: 10, size: "18 MB",
    folder: "launch", date: "15 Jul", usedIn: 2, reach: 15400, tone: 2, tags: ["carousel", "launch"] },
  { id: "as11", type: "photo", title: "Traffic lights, close", ratio: "1/1", size: "2.9 MB",
    folder: "unsorted", date: "14 Jul", usedIn: 0, reach: 0, tone: 0, tags: [] },
  { id: "as12", type: "photo", title: "Harbor, first run", ratio: "3/2", size: "5.7 MB",
    folder: "unsorted", date: "13 Jul", usedIn: 0, reach: 0, tone: 3, tags: ["harbor"] },
  { id: "as13", type: "video", title: "Sidebar collapse", ratio: "16/9", dur: "0:24", size: "31 MB",
    folder: "footage", date: "12 Jul", usedIn: 1, reach: 2700, tone: 1, tags: ["screencap"] },
  { id: "as14", type: "set", title: "Before / after, tokens", ratio: "4/5", count: 4, size: "7 MB",
    folder: "screens", date: "11 Jul", usedIn: 1, reach: 8900, tone: 6, tags: ["carousel", "design"] },
];

/* ═══ long-form ════════════════════════════════════════════════════════════
   Articles for Medium and LinkedIn. A word count, an outline, a destination
   and a read time — none of which a caption box can hold.
   ════════════════════════════════════════════════════════════════════════ */

export const LONGFORM = [
  { id: "lf1", title: "Local-first is a promise, not a stack detail", words: 2140, status: "draft",
    dest: ["md1", "li1"], updated: "2h ago", read: "9 min", pct: 0.86,
    excerpt: "Every local-first post I read argues about CRDTs. Almost none of them argue about the thing that actually decides whether your app is local-first: which row your code believes when the two disagree.",
    outline: [
      { h: "The argument nobody has", done: true },
      { h: "Offline mode is not local-first", done: true },
      { h: "Which row do you believe?", done: true },
      { h: "Timestamps without timezones are lies", done: true },
      { h: "What I would do differently", done: false },
    ] },
  { id: "lf2", title: "The manual publish decision", words: 880, status: "scheduled",
    dest: ["md1"], updated: "yesterday", read: "4 min", pct: 1, when: "Mon 28 Jul · 09:00",
    excerpt: "Auto-posting to Instagram needs Meta app review. Here is what I shipped on day one instead, and why it turned out to be the better product.",
    outline: [{ h: "The wall", done: true }, { h: "What shipped instead", done: true }, { h: "Why it stayed", done: true }] },
  { id: "lf3", title: "Three columns, forever", words: 310, status: "idea",
    dest: [], updated: "4 days ago", read: "2 min", pct: 0.18,
    excerpt: "A note on the one constraint that has survived every redesign of this app.",
    outline: [{ h: "The rule", done: true }, { h: "Every time I broke it", done: false }] },
  { id: "lf4", title: "Eleven accounts and one person", words: 1620, status: "published",
    dest: ["md1"], updated: "11 Jul", read: "7 min", pct: 1,
    views: 4820, reads: 1970, ratio: 41, claps: 214,
    excerpt: "What actually breaks when a solo founder runs eleven social accounts across five platforms, and which of those breakages are tooling problems.",
    outline: [{ h: "The roster", done: true }, { h: "What breaks first", done: true }, { h: "What I built", done: true }] },
  { id: "lf5", title: "A schedule is a shape", words: 1180, status: "published",
    dest: ["md1", "li1"], updated: "28 Jun", read: "5 min", pct: 1,
    views: 9140, reads: 3210, ratio: 35, claps: 486,
    excerpt: "Vignelli's transit diagram argues that a timetable is a picture. Most scheduling tools disagree, and they are wrong.",
    outline: [{ h: "The diagram", done: true }, { h: "Lists lie about time", done: true }] },
];

/* ═══ drafts and ideas ═════════════════════════════════════════════════════ */

export const DRAFTS = [
  { id: "d1", kind: "thread", parts: 4, targets: ["x1"], age: "6 days", blocker: "No time",
    body: "The manual-publish decision, and why it shipped on day one instead of never." },
  { id: "d2", kind: "carousel", parts: 0, targets: ["ig2"], age: "3 days", blocker: "No media",
    body: "Fieldnote's field guide, ten slides. Caption written, slides not made." },
  { id: "d3", kind: "post", parts: 1, targets: [], age: "9 days", blocker: "No account",
    body: "Nobody asks how many columns your app has until it has four." },
  { id: "d4", kind: "reel", parts: 1, targets: ["ig4"], age: "1 day", blocker: "No time",
    body: "Sidebar collapse, 24 seconds. Needs a first line." },
  { id: "d5", kind: "article", parts: 1, targets: ["md1", "li1"], age: "2h", blocker: "Unfinished",
    body: "Local-first is a promise, not a stack detail — one section from done." },
];

export const IDEAS = [
  { id: "i1", body: "Departure board for the week — posts leave from gates, accounts are destinations.", tag: "design", age: "2d" },
  { id: "i2", body: "Ask r/SideProject what people actually use to schedule.", tag: "reddit", age: "4d" },
  { id: "i3", body: "Carousel from the eight-screens annotation. Reuse the launch-week folder.", tag: "instagram", age: "5d" },
  { id: "i4", body: "Why @fieldnoteco went quiet, as a post about pruning projects.", tag: "x", age: "1w" },
  { id: "i5", body: "Screenshot the calendar in dark for the LinkedIn post.", tag: "todo", age: "1w" },
  { id: "i6", body: "Never more than three columns. Write it on the wall.", tag: "design", age: "2w" },
];

/* ═══ library ══════════════════════════════════════════════════════════════ */

export const LIBRARY_FILTERS = [
  { id: "all", label: "All", count: 342 },
  { id: "post", label: "Posts", count: 141 },
  { id: "thread", label: "Threads", count: 44 },
  { id: "carousel", label: "Carousels", count: 38 },
  { id: "reel", label: "Reels", count: 29 },
  { id: "image", label: "Images", count: 61 },
  { id: "article", label: "Articles", count: 17 },
  { id: "note", label: "Notes", count: 12 },
];

export const LIBRARY = [
  { id: "l1", kind: "reel", ratio: "9/16", account: "ig4", date: "24 Jul", duration: "0:42", title: "Drag to reschedule", tone: 1, reach: 9400 },
  { id: "l2", kind: "post", account: "x2", date: "24 Jul", tone: 0, reach: 21300,
    body: "Shipping is a design constraint. Every week you don't ship, the thing you're building drifts further from the thing anyone wanted." },
  { id: "l3", kind: "carousel", ratio: "4/5", account: "ig1", date: "23 Jul", slides: 8, title: "Eight screens, annotated", tone: 2, reach: 12100 },
  { id: "l4", kind: "note", account: null, date: "23 Jul", tone: 0,
    body: "A departure board for the week. Posts leave from gates. Accounts are destinations. Delays are honest." },
  { id: "l5", kind: "image", ratio: "3/2", account: "ig4", date: "22 Jul", title: "Desk, 7am", tone: 3, reach: 7800 },
  { id: "l6", kind: "thread", parts: 5, account: "x1", date: "22 Jul", tone: 0, reach: 18900,
    body: "Five things I got wrong about local-first before shipping one. Number two cost me a rewrite." },
  { id: "l7", kind: "article", ratio: "16/9", account: "md1", date: "21 Jul", source: "medium.com/@kartikb", title: "Eleven accounts and one person", tone: 4, reach: 4820 },
  { id: "l8", kind: "image", ratio: "1/1", account: "ig1", date: "21 Jul", title: "Grain test", tone: 5, reach: 3200 },
  { id: "l9", kind: "post", account: "x1", date: "20 Jul", tone: 0, reach: 6400,
    body: "Meta app review is the reason your scheduler has a Copy button instead of an API key." },
  { id: "l10", kind: "reel", ratio: "9/16", account: "th1", date: "20 Jul", duration: "1:08", title: "Composer, end to end", tone: 6, reach: 5200 },
  { id: "l11", kind: "carousel", ratio: "4/5", account: "ig1", date: "19 Jul", slides: 6, title: "Six tile shapes", tone: 7, reach: 6600 },
  { id: "l12", kind: "note", account: null, date: "19 Jul", tone: 0,
    body: "Never more than three columns. Write it on the wall." },
  { id: "l13", kind: "image", ratio: "3/4", account: "ig2", date: "18 Jul", title: "Fieldnote, cover study", tone: 8, reach: 1900 },
  { id: "l14", kind: "thread", parts: 3, account: "x1", date: "18 Jul", tone: 0, reach: 8800,
    body: "Why I stopped writing captions in the app that publishes them." },
  { id: "l15", kind: "post", account: "x2", date: "17 Jul", tone: 0, reach: 14200,
    body: "Nobody asks how many columns your app has until it has four." },
  { id: "l16", kind: "image", ratio: "3/2", account: "ig3", date: "17 Jul", title: "Calendar, month grid", tone: 9, reach: 2100 },
];

/* ═══ composer ═════════════════════════════════════════════════════════════ */

export const COMPOSER = {
  title: "Five things I got wrong about local-first",
  targets: ["x1", "th1"],
  schedule: "Today · 09:30",
  parts: [
    { n: 1, chars: 219, body: "Five things I got wrong about local-first before shipping one. Number two cost me a rewrite: I treated SQLite as a cache instead of the actual source of truth, and every sync bug after that was downstream of that one decision." },
    { n: 2, chars: 174, body: "1. \"Local-first\" is not \"offline mode.\" Offline mode is a degraded state you recover from. Local-first is the normal state, and the network is the thing that's optional." },
    { n: 3, chars: 186, body: "2. The database is the source of truth, not a cache of one. The moment I wrote a code path that trusted a server response over the local row, I had built a thin client with extra steps." },
    { n: 4, chars: 141, body: "3. Timestamps need a timezone or they are lies. A date without a time of day cannot schedule anything, and I shipped that bug twice." },
    { n: 5, chars: 128, body: "4. Sync is a feature, not a foundation. 5. If it doesn't work with the wifi off, you didn't build the thing you said you built." },
  ],
};

export const NEXT_DUE = { in: "2h 14m", account: "x1" };

/* ═══ calendar ═════════════════════════════════════════════════════════════
   A real month. `n` is how many pieces leave that day; `pub` is what already
   went out, so past and future share one grid instead of two screens.
   ════════════════════════════════════════════════════════════════════════ */

export const MONTH = {
  label: "July 2026", first: 2, days: 31, today: 26,
  cells: {
    1: { pub: 2, reach: 9100 }, 2: { pub: 1, reach: 4200 }, 3: { pub: 3, reach: 21400 },
    6: { pub: 2, reach: 7700 }, 7: { pub: 1, reach: 3100 }, 8: { pub: 4, reach: 33800 },
    9: { pub: 2, reach: 12200 }, 10: { pub: 1, reach: 2600 }, 11: { pub: 3, reach: 26100 },
    13: { pub: 2, reach: 8400 }, 14: { pub: 2, reach: 11900 }, 15: { pub: 4, reach: 41200 },
    16: { pub: 1, reach: 3300 }, 17: { pub: 3, reach: 19700 }, 18: { pub: 2, reach: 6100 },
    20: { pub: 3, reach: 16800 }, 21: { pub: 2, reach: 8000 }, 22: { pub: 3, reach: 26700 },
    23: { pub: 2, reach: 12100 }, 24: { pub: 3, reach: 30700 }, 25: { pub: 1, reach: 4400 },
    26: { pub: 2, reach: 8200, sched: [
      { t: "09:30", kind: "thread", acct: "x1", body: "Five things I got wrong about local-first" },
      { t: "11:00", kind: "carousel", acct: "ig1", body: "Eight screens, annotated" },
      { t: "14:15", kind: "post", acct: "x2", body: "Shipping is a design constraint" },
      { t: "17:45", kind: "reel", acct: "ig4", body: "Drag to reschedule" },
      { t: "19:00", kind: "post", acct: "x1", body: "Meta app review", failed: true },
    ] },
    27: { sched: [
      { t: "08:00", kind: "post", acct: "x2", body: "Sunday reading: Vignelli" },
      { t: "12:30", kind: "image", acct: "ig4", body: "Desk, 7am" },
      { t: "16:00", kind: "thread", acct: "x1", body: "Captions leave the app" },
    ] },
    28: { sched: [
      { t: "09:00", kind: "article", acct: "md1", body: "Local-first is a promise" },
      { t: "13:00", kind: "carousel", acct: "ig1", body: "Six tile shapes" },
      { t: "18:30", kind: "post", acct: "ig3", body: "Harbor's changelog" },
    ] },
    29: { sched: [{ t: "10:00", kind: "post", acct: "th1", body: "Threads mirror" }] },
    30: { sched: [{ t: "09:00", kind: "thread", acct: "x2", body: "On pruning projects" },
                  { t: "15:00", kind: "image", acct: "ig4", body: "Studio, evening" }] },
    31: { sched: [{ t: "09:00", kind: "article", acct: "md2", body: "Rust timers, honestly" }] },
  },
};

/* ═══ week grid, accounts × days ═══════════════════════════════════════════ */

export const WEEK = {
  days: [
    { key: "mon", label: "Mon", date: "21" }, { key: "tue", label: "Tue", date: "22" },
    { key: "wed", label: "Wed", date: "23" }, { key: "thu", label: "Thu", date: "24" },
    { key: "fri", label: "Fri", date: "25" }, { key: "sat", label: "Sat", date: "26", today: true },
    { key: "sun", label: "Sun", date: "27" },
  ],
  cells: {
    "x1|mon": [{ t: "09:00", kind: "post", body: "Shipping is a design constraint" }],
    "x1|wed": [{ t: "10:30", kind: "thread", body: "Why manual publish shipped first", parts: 4 }],
    "x1|sat": [{ t: "09:30", kind: "thread", body: "Five things I got wrong", parts: 5, sel: true },
               { t: "19:00", kind: "post", body: "Meta app review is the reason…", failed: true }],
    "x1|sun": [{ t: "16:00", kind: "thread", body: "Captions leave the app", parts: 3 }],
    "x2|tue": [{ t: "08:00", kind: "post", body: "Nobody asks how many columns…" }],
    "x2|sat": [{ t: "14:15", kind: "post", body: "Shipping is a design constraint" }],
    "x2|sun": [{ t: "08:00", kind: "post", body: "Sunday reading: Vignelli" }],
    "ig1|mon": [{ t: "12:00", kind: "image", body: "Desk, 7am" }],
    "ig1|thu": [{ t: "11:00", kind: "carousel", body: "Six tile shapes", parts: 6 }],
    "ig1|sat": [{ t: "11:00", kind: "carousel", body: "Eight screens, annotated", parts: 8 }],
    "ig1|sun": [{ t: "12:30", kind: "image", body: "Calendar, month grid" }],
    "ig4|wed": [{ t: "18:00", kind: "reel", body: "Sidebar collapse" }],
    "ig4|sat": [{ t: "17:45", kind: "reel", body: "Drag to reschedule" }],
    "th1|wed": [{ t: "15:00", kind: "post", body: "Threads mirror of the thread" }],
    "th1|sat": [{ t: "17:45", kind: "reel", body: "Drag to reschedule" }],
    "li1|mon": [{ t: "09:00", kind: "article", body: "Local-first is a promise" }],
    "md1|thu": [{ t: "09:00", kind: "article", body: "Eleven accounts, one person" }],
  },
};

export const TRAY = [
  { id: "t1", kind: "post", body: "Nobody asks how many columns your app has until it has four." },
  { id: "t2", kind: "thread", parts: 4, body: "The manual-publish decision, and why it shipped on day one." },
  { id: "t3", kind: "note", body: "Departure board for the week. Posts leave from gates." },
  { id: "t4", kind: "article", body: "Local-first is a promise, not a stack detail" },
  { id: "t5", kind: "carousel", parts: 6, body: "Six tile shapes, one grid." },
];

/* ═══ analytics ════════════════════════════════════════════════════════════
   Synthetic. Shaped to make the design decisions visible: one account
   compounding, one flat, one dead, one broken. A chart that only ever goes up
   is a chart you cannot design against.
   ════════════════════════════════════════════════════════════════════════ */

export const ANALYTICS = {
  window: "Last 30 days",
  totals: [
    { k: "Reach", v: "247K", d: +18.2 },
    { k: "Engagements", v: "11.4K", d: +9.6 },
    { k: "New followers", v: "+1,842", d: +24.1 },
    { k: "Posts out", v: "63", d: -4.5 },
  ],
  /* 30 points, one per day, normalised 0–100 for the plot */
  series: [
    { id: "x", label: "X", pts: [38, 41, 36, 44, 52, 48, 61, 57, 55, 64, 71, 66, 62, 74, 78, 72, 69, 81, 77, 84, 79, 88, 92, 86, 91, 97, 94, 99, 95, 100] },
    { id: "instagram", label: "Instagram", pts: [22, 26, 24, 31, 29, 36, 34, 41, 44, 39, 47, 52, 49, 55, 61, 58, 64, 62, 69, 74, 71, 78, 82, 79, 85, 88, 84, 91, 89, 94] },
    { id: "medium", label: "Medium", pts: [8, 9, 7, 12, 11, 9, 14, 12, 10, 16, 13, 11, 18, 15, 12, 19, 16, 14, 21, 17, 15, 22, 19, 16, 24, 20, 17, 26, 22, 19] },
    { id: "linkedin", label: "LinkedIn", pts: [18, 21, 19, 24, 22, 27, 25, 29, 26, 32, 30, 34, 31, 37, 35, 39, 36, 42, 40, 44, 41, 47, 45, 49, 46, 52, 50, 54, 51, 56] },
    { id: "threads", label: "Threads", pts: [6, 8, 7, 11, 9, 14, 12, 17, 15, 21, 18, 24, 22, 28, 26, 32, 29, 35, 33, 39, 36, 42, 40, 46, 43, 49, 47, 53, 50, 57] },
  ],
  top: [
    { id: "tp1", acct: "x2", kind: "post", reach: 21300, eng: 4.8, date: "24 Jul", body: "Shipping is a design constraint. Every week you don't ship…" },
    { id: "tp2", acct: "x1", kind: "thread", reach: 18900, eng: 6.1, date: "22 Jul", body: "Five things I got wrong about local-first before shipping one." },
    { id: "tp3", acct: "x2", kind: "post", reach: 14200, eng: 3.2, date: "17 Jul", body: "Nobody asks how many columns your app has until it has four." },
    { id: "tp4", acct: "ig1", kind: "carousel", reach: 12100, eng: 8.4, date: "23 Jul", body: "The eight screens of Validate, annotated." },
    { id: "tp5", acct: "ig4", kind: "reel", reach: 9400, eng: 11.2, date: "24 Jul", body: "42 seconds: dragging a post across the calendar." },
  ],
  /* best-time heat: 7 rows (Mon–Sun) × 8 columns (06,09,11,13,15,17,19,21) */
  hours: ["06", "09", "11", "13", "15", "17", "19", "21"],
  heat: [
    [12, 61, 44, 38, 29, 47, 71, 33],
    [18, 74, 52, 41, 33, 55, 66, 28],
    [14, 68, 47, 36, 44, 62, 58, 31],
    [21, 82, 61, 44, 38, 51, 74, 36],
    [16, 57, 38, 31, 27, 44, 52, 24],
    [9, 41, 66, 52, 44, 78, 61, 41],
    [7, 33, 58, 47, 36, 64, 44, 29],
  ],
  reposts: [
    { id: "rp1", acct: "x2", was: "17 Jul", reach: 14200, body: "Nobody asks how many columns your app has until it has four." },
    { id: "rp2", acct: "ig1", was: "11 Jul", reach: 15400, body: "Launch week, ten cards. The whole story in one swipe." },
  ],
};

/* ═══ pipeline ═════════════════════════════════════════════════════════════
   Readiness as position. A card cannot move right until its gate is satisfied,
   which turns "why is this stuck?" from a question into a column.
   ════════════════════════════════════════════════════════════════════════ */

export const PIPELINE = [
  { id: "captured", label: "Captured", gate: "A thought, nothing else", n: 12, items: [
    { id: "p1", kind: "note", body: "Departure board for the week — posts leave from gates, accounts are destinations.", age: "2d" },
    { id: "p2", kind: "note", body: "Why @fieldnoteco went quiet, as a post about pruning projects.", age: "1w" },
    { id: "p3", kind: "note", body: "Ask r/SideProject what people actually use to schedule.", age: "4d" },
    { id: "p4", kind: "note", body: "Never more than three columns. Write it on the wall.", age: "2w" },
  ]},
  { id: "written", label: "Written", gate: "Words exist", n: 9, items: [
    { id: "p5", kind: "thread", parts: 4, body: "The manual-publish decision, and why it shipped on day one instead of never.", age: "6d", chars: 812 },
    { id: "p6", kind: "post", body: "Nobody asks how many columns your app has until it has four.", age: "9d", chars: 61 },
    { id: "p7", kind: "article", body: "Local-first is a promise, not a stack detail.", age: "2h", chars: 2140, warn: "One section short" },
  ]},
  { id: "dressed", label: "Dressed", gate: "Media attached, where the kind needs it", n: 6, items: [
    { id: "p8", kind: "carousel", parts: 0, body: "Fieldnote's field guide, ten slides.", age: "3d", block: "No media" },
    { id: "p9", kind: "reel", body: "Sidebar collapse, 24 seconds.", age: "1d", asset: "as13" },
    { id: "p10", kind: "carousel", parts: 6, body: "Six tile shapes, one grid.", age: "1d", asset: "as6" },
  ]},
  { id: "aimed", label: "Aimed", gate: "At least one account", n: 5, items: [
    { id: "p11", kind: "thread", parts: 5, body: "Five things I got wrong about local-first.", targets: ["x1", "th1"], age: "1d" },
    { id: "p12", kind: "carousel", parts: 8, body: "Eight screens, annotated.", targets: ["ig1"], age: "1d" },
    { id: "p13", kind: "post", body: "Harbor's changelog is a markdown file and a cron job.", targets: ["ig3"], age: "2d", block: "Account went quiet 6d" },
  ]},
  { id: "scheduled", label: "Scheduled", gate: "A real local time", n: 17, items: [
    { id: "p14", kind: "thread", body: "Five things I got wrong about local-first.", when: "Today 09:30", targets: ["x1", "th1"] },
    { id: "p15", kind: "carousel", body: "Eight screens, annotated.", when: "Today 11:00", targets: ["ig1"] },
    { id: "p16", kind: "post", body: "Shipping is a design constraint.", when: "Today 14:15", targets: ["x2"] },
    { id: "p17", kind: "reel", body: "Drag to reschedule.", when: "Today 17:45", targets: ["ig4", "th1"] },
  ]},
  { id: "out", label: "Out", gate: "Published — and what it did", n: 342, items: [
    { id: "p18", kind: "post", body: "Shipping is a design constraint.", when: "24 Jul", targets: ["x2"], reach: 21300, eng: 4.8 },
    { id: "p19", kind: "thread", body: "Five things I got wrong about local-first.", when: "22 Jul", targets: ["x1"], reach: 18900, eng: 6.1 },
    { id: "p20", kind: "carousel", body: "Eight screens, annotated.", when: "23 Jul", targets: ["ig1"], reach: 12100, eng: 8.4 },
    { id: "p21", kind: "post", body: "Meta app review is the reason…", when: "19:00 yesterday", targets: ["x1"], failed: true },
  ]},
];

/* ═══ almanac ══════════════════════════════════════════════════════════════
   One time axis. The past carries what each piece earned; the future carries
   what is planned. There is no analytics screen because the numbers never left
   the post they belong to.
   ════════════════════════════════════════════════════════════════════════ */

export const ALMANAC = {
  future: [
    { day: "Sat 26 Jul", rel: "Today", items: [
      { t: "09:30", kind: "thread", acct: "x1", also: ["th1"], body: "Five things I got wrong about local-first before shipping one.", parts: 5, next: true },
      { t: "11:00", kind: "carousel", acct: "ig1", body: "The eight screens of Validate, annotated.", parts: 8 },
      { t: "14:15", kind: "post", acct: "x2", body: "Shipping is a design constraint." },
      { t: "17:45", kind: "reel", acct: "ig4", also: ["th1"], body: "42 seconds: dragging a post across the calendar.", dur: "0:42" },
      { t: "19:00", kind: "post", acct: "x1", body: "Meta app review is the reason your scheduler has a Copy button.", failed: true },
    ]},
    { day: "Sun 27 Jul", rel: "Tomorrow", items: [
      { t: "08:00", kind: "post", acct: "x2", also: ["li1"], body: "Sunday reading: the Vignelli transit diagram." },
      { t: "12:30", kind: "image", acct: "ig4", body: "Desk, 7am, third coffee." },
      { t: "16:00", kind: "thread", acct: "x1", body: "Why I stopped writing captions in the app that publishes them.", parts: 3 },
    ]},
    { day: "Mon 28 Jul", rel: "In 2 days", items: [
      { t: "09:00", kind: "article", acct: "md1", also: ["li1"], body: "Local-first is a promise, not a stack detail.", words: 2140 },
      { t: "13:00", kind: "carousel", acct: "ig1", body: "Six tile shapes, one grid.", parts: 6 },
    ]},
  ],
  past: [
    { day: "Fri 25 Jul", rel: "Yesterday", reach: 4400, items: [
      { t: "09:00", kind: "post", acct: "x1", body: "The whole publish path is a Rust timer and a native notification.", reach: 4400, eng: 2.1 },
    ]},
    { day: "Thu 24 Jul", rel: "2 days ago", reach: 30700, items: [
      { t: "10:15", kind: "post", acct: "x2", body: "Shipping is a design constraint. Every week you don't ship, the thing you're building drifts further from the thing anyone wanted.", reach: 21300, eng: 4.8, best: true },
      { t: "17:45", kind: "reel", acct: "ig4", body: "42 seconds: dragging a post across the calendar.", reach: 9400, eng: 11.2, dur: "0:42" },
    ]},
    { day: "Wed 23 Jul", rel: "3 days ago", reach: 12100, items: [
      { t: "11:00", kind: "carousel", acct: "ig1", body: "The eight screens of Validate, annotated.", reach: 12100, eng: 8.4, parts: 8 },
    ]},
    { day: "Tue 22 Jul", rel: "4 days ago", reach: 26700, items: [
      { t: "09:30", kind: "thread", acct: "x1", body: "Five things I got wrong about local-first before shipping one.", reach: 18900, eng: 6.1, parts: 5 },
      { t: "12:00", kind: "image", acct: "ig4", body: "Desk, 7am.", reach: 7800, eng: 5.4 },
    ]},
  ],
  season: {
    label: "July, so far",
    line: "Twenty-six days, 63 pieces, 247K reach. Two accounts compounding, one dark.",
    stats: [
      { k: "Best day", v: "Thu 15 Jul", note: "41.2K reach, four pieces" },
      { k: "Best hour", v: "09:00", note: "consistently, on X" },
      { k: "Quiet longest", v: "@fieldnoteco", note: "11 days, no posts" },
      { k: "Most reused", v: "Desk, 7am", note: "3 pieces drew on it" },
    ],
  },
};

/* ═══ studio ═══════════════════════════════════════════════════════════════
   One idea, fanned into per-destination pieces, with the raw material it drew
   on kept visible beside it.
   ════════════════════════════════════════════════════════════════════════ */

export const STUDIO = {
  idea: {
    title: "Five things I got wrong about local-first",
    thesis: "Everyone argues about CRDTs. Nobody argues about which row your code believes when two disagree — and that is the decision that actually makes an app local-first.",
    captured: "Tuesday, 22 Jul",
    tags: ["local-first", "engineering", "launch-week"],
  },
  steps: [
    { body: "Pull the two sync bugs from the commit log as evidence", done: true },
    { body: "Decide whether the article or the thread goes first", done: true },
    { body: "Screenshot the row-conflict case", done: false },
  ],
  pieces: [
    { platform: "x", account: "x1", kind: "thread", parts: 5, chars: 219, when: "Today · 09:30", status: "scheduled",
      body: "Five things I got wrong about local-first before shipping one. Number two cost me a rewrite: I treated SQLite as a cache instead of the actual source of truth, and every sync bug after that was downstream of that one decision." },
    { platform: "instagram", account: "ig1", kind: "carousel", parts: 8, chars: 96, when: "Today · 11:00", status: "scheduled", asset: "as2",
      body: "The eight screens of Validate, annotated. Swipe for the ones that got cut and why." },
    { platform: "medium", account: "md1", kind: "article", parts: 1, chars: 2140, when: "Mon · 09:00", status: "draft",
      body: "Every local-first post I read argues about CRDTs. Almost none of them argue about the thing that actually decides whether your app is local-first: which row your code believes when the two disagree." },
    { platform: "threads", account: "th1", kind: "post", parts: 1, chars: 0, when: null, status: "idea", body: "" },
  ],
  siblings: [
    { title: "The manual publish decision", n: 2, state: "2 scheduled" },
    { title: "Eleven accounts and one person", n: 3, state: "all out" },
    { title: "Three columns, forever", n: 1, state: "idea" },
    { title: "Why captions leave the app", n: 3, state: "1 draft" },
  ],
  shelf: ["as2", "as3", "as8", "as1"],
};

/* ═══ triage inbox, folded into Pipeline's "needs you" rail ════════════════ */

export const INBOX = [
  { id: "n1", why: "Goes out in 2h 14m", urgency: "now", kind: "thread", parts: 5, targets: ["x1", "th1"],
    body: "Five things I got wrong about local-first before shipping one." },
  { id: "n2", why: "Failed to post — 19:00 yesterday", urgency: "problem", kind: "post", targets: ["x1"],
    body: "Meta app review is the reason your scheduler has a Copy button instead of an API key." },
  { id: "n3", why: "@fieldnote.co needs re-authorising", urgency: "problem", kind: "gap", targets: ["ig2"],
    body: "Two scheduled pieces cannot leave until the connection is repaired." },
  { id: "n4", why: "Draft with no time · 6 days old", urgency: "stale", kind: "thread", parts: 4, targets: ["x1"],
    body: "The manual-publish decision, and why it shipped on day one instead of never." },
  { id: "n5", why: "@fieldnoteco has nothing scheduled", urgency: "gap", kind: "gap", targets: ["x3"],
    body: "Nothing queued. Last post was 11 days ago against a 3-a-week target." },
  { id: "n6", why: "39 assets never sorted", urgency: "idea", kind: "note", targets: [],
    body: "Unsorted folder has grown for three weeks. Nine of them are from launch week." },
];

/* ═══ command parse, for the Almanac capture bar ═══════════════════════════ */

export const COMMAND = {
  typed: "sat 9:30am @validateapp @validateapp.threads five things I got wrong about local-first",
  parsed: { when: "Saturday 26 July · 09:30", tz: "Asia/Kolkata", targets: ["x1", "th1"], kind: "thread" },
};
