# Flexi Studio — How to Use the Overlay, Editor, and Pulls Window

> Requirements: [ACT](https://advancedcombattracker.com/) + [OverlayPlugin](https://github.com/OverlayPlugin/OverlayPlugin)
> (installed via the ACT plugin manager) + FFXIV parsing plugin enabled in ACT.

## 0. Lite vs Full — pick first

Choose the overlay URL once, when you add the overlay in ACT → OverlayPlugin.

| | **Full** (`flexi-studio/`) | **Lite** (`flexi-studio/lite/`) |
|---|---|---|
| Live meter bars with DPS / HPS / DTPS / rDPS display + sorting | Yes | Yes |
| Header/footer, encounter history, filters, blur-names, merge-pets | Yes | Yes |
| Live editor sync (`Apply Changes`, no reload) | Yes | Yes |
| **Pulls / Breakdown popout** (`Pulls` button, click-a-bar drill-down) | Yes | **No — hidden and disabled** |
| Pull-analysis data collection (abilities, casts, deaths, timelines, HP samples) | Yes | **No — not collected** |
| Session history depth | ~15 pulls | ~5 pulls, lightweight (name / duration / DPS only) |
| Editor `Open Breakdown` button | Visible | Hidden |
| Use when | You want post-pull review and prog analysis | You want the cheapest meter-only overlay |

URLs:

- Full overlay: `https://reinthx.github.io/flexi-studio/`
- Lite overlay: `https://reinthx.github.io/flexi-studio/lite/`
- Editor: `https://reinthx.github.io/flexi-studio/#/editor`
  (opened from Lite it keeps `?lite=1` so the editor knows Breakdown is unavailable)

You can switch at any time by changing the overlay URL in ACT.
Config and presets are stored locally per ACT/browser environment.

---

## 1. The Tool — live overlay meter

This is what you see during combat. Transparent background, bars scroll
internally when the ACT panel is small. `Waiting for combat data…` means
no combat data has arrived yet.

### 1.1 Add it

1. ACT → OverlayPlugin tab → new overlay.
2. Paste the Full or Lite URL from above.
3. Resize the panel to taste.
4. If it stays blank, see Troubleshooting at the bottom.

### 1.2 Header (top) — in-combat controls

- **Encounter text** — rendered from the Editor → Global template.
  Tokens: `{encounter}` `{zone}` `{duration}` `{totalDPS}` `{totalHPS}`
  `{totalDTPS}` `{totalRDPS}` `{pullNumber}` `{pullCount}`.
- **Chevron `▼` on the encounter name** — Encounter History.
  Opens recent pulls (Full ~15, Lite ~5). Click a row to freeze the meter
  on that pull; `Back to Live` returns to live data. Very short windows
  switch to a horizontal list automatically.
- **`Merge`** — fold pets into their owner (on) or list them separately (off).
- **`ALL → ALLIANCE → PARTY → SELF`** — combatant filter cycle; controls who appears.
- **`🔒`** — blur every name except self/`YOU` (screenshots / streaming).
- **`Editor`** — opens the Studio editor. From Lite it rewrites the URL to
  the root plus `?lite=1#/editor`.
- **`Pulls` (Full only)** — opens the Pulls dashboard / Breakdown popout.
  Not rendered in Lite.
- **Pin** — pin/unpin the header. A pinned header shows a resize-corner handle.

The footer uses the same renderer in footer mode but has no action buttons.

### 1.3 Bars

- Sorted live by the metric selected in Global settings.
- Rank 1 can get a crown, glow, and taller bar when enabled (Global → Rank 1).
- **Full: click any bar** to open that combatant's Breakdown.
  **Lite: clicking does nothing** (drill-down is disabled with the data collection).
- Self is matched via `ChangePrimaryPlayer` or the name `YOU`.

---

## 2. The Editor (`#/editor`)

Open it from the overlay's `Editor` button or directly in a browser.
Layout: **Top Bar + Left sidebar + Center preview + Right sidebar.**

### 2.1 Top Bar

- Save badge: `Saved` / `Unsaved changes` (yellow) / `Live overlay updated` (green flash).
- **`Apply Changes`** — saves config and broadcasts it
  (`localStorage: act-flexi-github-sync`) so open overlays update
  **without a reload**. Always click this after editing; it flashes `✓ Applied`.
- **`Open Breakdown` (Full only)** — opens `#/breakdown` for testing with preview data.
- **`Help`** — opens this guide inside the app (Overlay / Editor / Pulls / Lite tabs).
- **Build badge (`v… · abc1234`)** — the running build. Clicking it opens the
  exact GitHub commit it was built from (a `dev` badge links to the repo
  instead). Hover shows the full SHA + build time.

### 2.2 Center — Preview Area

Live WYSIWYG driven by simulated/live frames:

- Drag the meter to test positioning; bars scroll like the real overlay.
- Reflects orientation, header/footer, rank indicator, and colors.
- The preview height is remembered for the session only.

Workflow: edit left/right → watch preview → `Apply Changes` → verify in ACT.

### 2.3 Left sidebar — Bar Style

Defaults for all bars (per-self/role/job overrides live under Right → Colors).
Collapsed headers carry badges summarizing the current setup.

- **Bar Fill** — solid, gradient (linear/radial, angle, animated
  rotate/scroll/shimmer) or texture (preset + repeat, opacity, blend mode,
  tint). *Apply Job Color* / *Apply Role Color* hand the fill color to the
  Colors panel instead. Below the fill: *Offset Y* (drop the fill inside the
  bar), *Segments* (striped fill — width, gap, angle, or growing segments via
  Start/End Height), *Outline* (color + width), *Shadow*.
- **Background** — the bar track behind the fill: same fill editor, plus its
  own *Outline* toggle and *Shadow*.
- **Metric Strip** — thin secondary bar. *Source* (current metric, DPS, HPS,
  DTPS, rDPS, Damage %, Healed %, Crit %, Threat), *Height / Width / Offset X*,
  *Position* top/bottom + opacity, *Placement* inside or outside the bar
  (+ gap), *Fill Style* (own style or inherit bar/background) and *Track Bg*,
  plus *Inherit Shape/Shadow*.
- **Shape** — the bar silhouette: edge style, corner cuts/radius, insets.
- **Label** — row text as reorderable *fields* (drag to reorder). Each field
  has a template with tokens (`{name} {job} {rank} {value} {pct} {crithit%}
  {directhit%} {enchps} {rdps} {maxHit} {maxHitName} {maxHitValue}`), plus
  font, size, color modes (custom / job / role / self), anchors, value format,
  padding, outline/shadow effects and death display.
- **Icon** — job icon size, opacity, X/Y offset, rotation, plus backdrop
  shape, outline and shadow/glow styling.
- **Size** — bar height (vertical) or width (horizontal), second dimension in
  horizontal mode, and the gap between rows.

### 2.4 Right sidebar — Colors / Presets / Global

Collapsible sections. Badges summarize state
(`Default` vs `Self · 2 Roles`, `Horiz · DPS`, preset name).

**Colors**

- Resolution runs top-down: `Self` → `By Role`
  (tank / healer / melee / ranged / caster) → `By Job` (grouped, with a group
  toggle plus per-job toggles). Unticked entries fall through to the default.
- Each entry sets a color plus a second gradient color; `↺` restores default.
- These only recolor fills where *Apply Job/Role Color* (or label color
  modes) is turned on — a toggle with no visible change usually means that.

**Presets**

- Built-ins (e.g. `default`) in a collapsible category; customs group below,
  optionally under your own category names. `↕` = vertical, `↔` = horizontal.
- Click to apply; type a name (+ optional category) and `Save` to create.
  Saving over an existing name, `Overwrite`, and `Delete` all ask for
  confirmation first.
- `Export` (single/all → JSON modal + copy) and `Import` (paste JSON;
  name conflicts show a conflict dialog).
- Customs are stored locally in your ACT/browser environment.

**Global**

- **Window** — the meter backdrop: *Transparency*, *Type* solid / gradient
  (add/remove color stops, angle, linear/radial) / texture, *Border* (color,
  width, radius), *Shadow* (color, blur, X/Y), overall *Opacity*, and
  *Out-of-combat* behavior: show, dim to a level, or hide.
- **Layout** — *Vertical* (classic bar list) vs *Horizontal* orientation.
- **Values** — *Sort by* DPS / HPS / DTPS / rDPS / Role (bar sorting follows
  this); *Format* raw (`12345`), short (`12.3k`) or comma (`12,345`).
- **Animation** — *Transition* (bar movement smoothing, ms) and *Hold* (how
  long the meter lingers after combat, s). Set Transition to 0 for instant.
- **Rank 1** — On/Off badge. Quick *Theme* presets (Gold Crown, Glowing Gold,
  Ruby Winner, Neon Winner, Minimal Gold, Ice Champion), *Height +* (taller
  top bar), *Bar Fill* solid/gradient, *Crown* (emoji or uploaded image, with
  size / X-Y offset / rotation / anchors), *Glow*, gradient *Name*, and icon
  glow/shadow/backdrop.
- **Fonts** — picked per-label under Bar Style → Label → Font. (The
  standalone Custom Fonts source manager is currently hidden.)

---

## 3. The Pulls Window — Breakdown popout (`#/breakdown`, Full only)

A separate `1300×840` window (`window.name === 'flexi-breakdown'`,
or `hash === '/breakdown'`, or `?breakdown=1`). Data arrives over
`BroadcastChannel: flexi-breakdown` plus a snapshot key —
**keep the meter open while reviewing** or the window goes stale.

### 3.1 Opening it

- Meter header **`Pulls`** → Pulls dashboard (`activeView='pulls'`).
- **Click a meter bar** → that combatant's Overview
  (name passed via `localStorage: flexi-breakdown-init` + pre-selected broadcast).
- Editor top bar **`Open Breakdown`** → testing with preview data.

Left side is the **Actor Rail** (party / self / enemies / NPCs, search,
collapsible groups, `Show Enemies` / `Friendly NPCs` toggles).
Click an actor to switch. Top tabs:

`Overview | Pulls | Done | Taken | Timeline | Deaths | Casts | Events`

### 3.2 Tabs

- **Overview** — headline cards (total, DPS/rDPS, deaths, DTPS), top
  abilities, highest hit, death/timeline spikes. First look after a wipe.
- **Pulls** — session review.
  - Left: `Session Pulls` grouped by encounter (`Encounter · N pulls`);
    each row shows duration, `Live`/`Wipe`/`Clear` pill, boss %, DPS/rDPS,
    deaths. Click loads that historical pull.
  - Cards: `Enemy Progress`, `Party rDPS` (Δ vs previous), `Deaths`
    (cluster count), `Damage Taken` (total + DTPS).
  - `Quick Read` notes plus red raid-buff warnings (party has buffers but
    no casts/credit seen).
  - `Death Windows` (up to 8, click → Deaths tab), `Damage Attribution`
    bar chart (group DPS per bucket, death/raise markers, click → Timeline)
    plus table (Amount / % / DPS / rDPS / Given / Taken / Deaths;
    click a row → that actor).
- **Done** — damage dealt by the selected actor: by Ability / Targets / Sources.
  Sortable by Total / DPS / Hits / Max / Crit %. Click an ability for the cast inspector.
- **Taken** — damage (or healing-received mode) taken by the selected actor.
- **Timeline** — bucketed DPS/rDPS/HPS/DTPS chart with buff / death / raise /
  spike overlays, hover tooltip, death/raise markers, click-to-focus window.
- **Deaths** — sorted player deaths with pre-death HP bars, Recap / Context /
  Related tabs, casts-in-window, healing counts, raise time or `no raise seen`.
- **Casts** — per-ability cast timeline with cooldown windows;
  filters `cooldowns` / `mitigations` / `dps` / `heals`; mitigation effectiveness.
- **Events** — raw LogLine-derived stream; filters
  `damage` / `healing` / `casts` / `deaths` / `raises`, scope
  `selected` / `party` / `all`, plus `window only` for the focused window.

Suggested prog loop: `Pulls` → low-rDPS pull → `Damage Attribution` →
click the low player → `Done` → `Timeline` bucket with deaths → `Deaths` →
`Casts` for missed mitigation.

### 3.3 Lite behavior

No `Pulls` button, bar clicks disabled, open-functions early-return.
Forcing `#/breakdown` on Lite yields no payloads — use Full for analysis.

---

## Troubleshooting

- **Blank overlay** — ACT running, OverlayPlugin enabled, FFXIV parsing
  plugin feeding, correct URL (Full vs Lite path).
- **Edits not showing** — click `Apply Changes`, then reload the overlay.
  Config/presets are local per environment.
- **Fonts missing** — folder must hold font files, use a Chromium browser,
  re-grant folder permission.
- **Breakdown empty/stale** — keep the meter open (it broadcasts), reopen via
  `Pulls` rather than a copied URL, allow popups in ACT/browser.
