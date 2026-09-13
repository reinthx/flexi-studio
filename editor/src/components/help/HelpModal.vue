<script setup lang="ts">
import { computed, ref } from 'vue'
import { getBuildCommitUrl, getBuildInfo, getBuildLabel } from '@shared/buildInfo'
import { openExternalUrl } from '@shared/externalLink'

type HelpTab = 'lite' | 'overlay' | 'editor' | 'pulls'

const props = withDefaults(defineProps<{ initialTab?: HelpTab; isLite?: boolean }>(), {
  initialTab: 'lite',
  isLite: false,
})

const emit = defineEmits<{ close: [] }>()

const activeTab = ref<HelpTab>(props.initialTab)
const build = getBuildInfo()
const buildLabel = getBuildLabel(build)
const commitUrl = getBuildCommitUrl(build)
// Never a dead badge: unknown builds link to the repo instead of a commit.
const buildHref = computed(() => commitUrl ?? build.repo)
const isDevBuild = computed(() => commitUrl === null)

const GUIDE_URL = 'https://github.com/reinthx/flexi-studio/blob/main/docs/USAGE.md'

// Short build date (YYYY-MM-DD) shown next to the build badge; '' when unknown.
const buildDate = computed(() => {
  const t = build.time
  if (!t) return ''
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return t.slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})

const tabs: Array<{ id: HelpTab; label: string }> = [
  { id: 'lite', label: 'Lite vs Full' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'editor', label: 'Editor' },
  { id: 'pulls', label: 'Pulls' },
]

const buildTitle = computed(() => {
  const parts = [`SHA: ${build.sha}`]
  if (build.time) parts.push(`Built: ${build.time}`)
  parts.push(isDevBuild.value ? 'Open the repository on GitHub' : 'Click to open the commit on GitHub')
  return parts.join('\n')
})

function closeOnBackdrop(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('help-backdrop')) emit('close')
}
</script>

<template>
  <div class="help-backdrop" @click="closeOnBackdrop">
    <div class="help-modal" role="dialog" aria-label="Flexi Studio help">
      <div class="help-header">
        <span class="help-title">Flexi Studio — How to use</span>
        <button class="help-close" @click="emit('close')" title="Close">✕</button>
      </div>

      <div class="help-tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="help-tab"
          :class="{ active: activeTab === t.id }"
          @click="activeTab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="help-body">
        <!-- Lite vs Full -->
        <section v-if="activeTab === 'lite'">
          <p class="help-lead">Pick the overlay URL once in ACT → OverlayPlugin.</p>
          <table class="help-table">
            <thead><tr><th></th><th>Full</th><th>Lite</th></tr></thead>
            <tbody>
              <tr><td>Meter bars, DPS / HPS / DTPS / rDPS</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Header, history, filters, blur, merge-pets</td><td>Yes</td><td>Yes</td></tr>
              <tr><td><strong>Pulls / Breakdown popout</strong></td><td>Yes</td><td><strong>No</strong></td></tr>
              <tr><td>Pull-analysis data collection</td><td>Yes</td><td><strong>No</strong></td></tr>
              <tr><td>Session history</td><td>~15 pulls</td><td>~5, lightweight</td></tr>
            </tbody>
          </table>
          <ul class="help-list">
            <li>Full: <code>https://reinthx.github.io/flexi-studio/</code></li>
            <li>Lite: <code>https://reinthx.github.io/flexi-studio/lite/</code></li>
            <li>Editor: <code>…/flexi-studio/#/editor</code> <span v-if="isLite">(you are in Lite mode: <code>?lite=1</code>, no Breakdown)</span></li>
          </ul>
        </section>

        <!-- Overlay -->
        <section v-if="activeTab === 'overlay'">
          <p class="help-lead">What you see during combat.</p>
          <ul class="help-list">
            <li><strong>Encounter text</strong> — from Global template tokens <code>{encounter} {duration} {totalDPS} {totalHPS} {totalDTPS} {totalRDPS} {pullNumber}</code>.</li>
            <li><strong>Chevron ▼</strong> — Encounter History. Click a row to freeze that pull, <em>Back to Live</em> to resume.</li>
            <li><strong>Merge</strong> — fold pets into owners or list separately.</li>
            <li><strong>ALL → ALLIANCE → PARTY → SELF</strong> — who appears on the meter.</li>
            <li><strong>🔒</strong> — blur all names except self (streams/screenshots).</li>
            <li><strong>Editor</strong> — opens this Studio. <strong>Pulls</strong> (Full only) — opens the Pulls dashboard.</li>
            <li><strong>Click a bar (Full)</strong> — that combatant's Breakdown. Lite: clicks do nothing.</li>
          </ul>
        </section>

        <!-- Editor booklet -->
        <section v-if="activeTab === 'editor'">
          <p class="help-lead">Top Bar + left Bar Style + center Preview + right Colors / Presets / Global. Expand each part below.</p>

          <details class="help-details" open>
            <summary>Top Bar — saving &amp; pushing live</summary>
            <ul class="help-list">
              <li><strong>Save badge</strong> — <em>Saved</em>, <em>Unsaved changes</em> (yellow, edits not yet applied), <em>Live overlay updated</em> (green flash after Apply).</li>
              <li><strong>Apply Changes</strong> — saves the profile and broadcasts it to every open overlay, so the meter restyles with <strong>no reload</strong>. Always click it after editing; it flashes <em>✓ Applied</em>.</li>
              <li><strong>Open Breakdown</strong> (Full only) — opens the Breakdown popout with preview data for styling checks.</li>
              <li><strong>Build badge</strong> (<code>{{ buildLabel }}</code>) — the running build; clicking opens the exact commit (or the repo for dev builds). Hover shows SHA + build time.</li>
            </ul>
          </details>

          <details class="help-details">
            <summary>Preview (center) — live WYSIWYG</summary>
            <ul class="help-list">
              <li>Shows your current style on simulated/live frames, including header/footer, rank numbers and Rank #1 styling.</li>
              <li><strong>Drag</strong> the meter anywhere to test positioning; bars scroll internally like the real overlay.</li>
              <li>Preview height is remembered for the session only — it is not part of the saved profile.</li>
            </ul>
          </details>

          <details class="help-details">
            <summary>Bar Style (left) — defaults for every bar</summary>
            <p class="help-note">These are the <em>defaults</em>. Per-self / per-role / per-job overrides live under Colors on the right.</p>
            <ul class="help-list">
              <li><strong>Bar Fill</strong> — solid, gradient (linear/radial, angle, animated rotate/scroll/shimmer) or texture (preset + repeat, opacity, blend mode, tint). <em>Apply Job Color</em> / <em>Apply Role Color</em> hand the fill color to the Colors panel instead. Below: <em>Offset Y</em> (drop the fill inside the bar), <em>Segments</em> (striped fill — width, gap, angle, or growing segments via Start/End Height), <em>Outline</em> (color + width), <em>Shadow</em>.</li>
              <li><strong>Background</strong> — the bar track behind the fill: same fill editor, plus its own <em>Outline</em> toggle and <em>Shadow</em>.</li>
              <li><strong>Metric Strip</strong> — a thin secondary bar. <em>Source</em> (current metric, DPS, HPS, DTPS, rDPS, Damage %, Healed %, Crit %, Threat), <em>Height / Width / Offset X</em>, <em>Position</em> top/bottom + opacity, <em>Placement</em> inside or outside the bar (+ gap), <em>Fill Style</em> (own style or inherit bar/background) and <em>Track Bg</em>, plus <em>Inherit Shape/Shadow</em>.</li>
              <li><strong>Shape</strong> — the bar silhouette: edge style, corner cuts/radius, insets. The header badge previews the current setup.</li>
              <li><strong>Label</strong> — row text as reorderable <em>fields</em> (drag to reorder). Each field has a template with tokens: <code>{name} {job} {rank} {value} {pct} {crithit%} {directhit%} {enchps} {rdps} {maxHit} {maxHitName} {maxHitValue}</code> — plus font, size, color modes (custom / job / role / self), anchors, value format, padding, outline/shadow effects and death display.</li>
              <li><strong>Icon</strong> — job icon size, opacity, X/Y offset, rotation, plus backdrop shape, outline and shadow/glow styling.</li>
              <li><strong>Size</strong> — bar height (vertical) or width (horizontal), second dimension in horizontal mode, and the gap between rows.</li>
            </ul>
          </details>

          <details class="help-details">
            <summary>Colors (right) — who gets which color</summary>
            <ul class="help-list">
              <li>Runs top-down: <strong>Self Bar</strong> → <strong>By Role</strong> (tank / healer / melee / ranged / caster) → <strong>By Job</strong> (grouped, with a group toggle plus per-job toggles). Unticked entries fall through to the default.</li>
              <li>Each entry sets a color and a second gradient color; <strong>↺</strong> restores the default.</li>
              <li>The header badge summarizes at a glance (<em>Default</em> vs <em>Self · 2 Roles · 3 Jobs</em>).</li>
              <li>These only recolor fills where <em>Apply Job/Role Color</em> (or label color modes) is turned on — flipping a toggle with no visible change usually means that.</li>
            </ul>
          </details>

          <details class="help-details">
            <summary>Presets (right) — save &amp; share looks</summary>
            <ul class="help-list">
              <li><strong>Built-in</strong> presets ship with the app (collapsible category); your customs group below, optionally under your own category names. <code>↕</code> = vertical, <code>↔</code> = horizontal.</li>
              <li>Type a name (+ optional category) and <strong>Save</strong>. Saving over an existing name, <strong>Overwrite</strong> and <strong>Delete</strong> all ask for confirmation first.</li>
              <li><strong>Export</strong> copies one preset (or all) as JSON for sharing; <strong>Import</strong> pastes it back, with a conflict dialog if the name exists.</li>
              <li>Customs are stored locally in your ACT/browser environment — they travel with the machine, not the URL.</li>
            </ul>
          </details>

          <details class="help-details">
            <summary>Global (right) — window, layout, values, animation, Rank #1</summary>
            <ul class="help-list">
              <li><strong>Window</strong> — the meter backdrop: <em>Transparency</em>, <em>Type</em> solid / gradient (add/remove color stops, angle, linear/radial) / texture, <em>Border</em> (color, width, radius), <em>Shadow</em> (color, blur, X/Y), overall <em>Opacity</em>, and <em>Out-of-combat</em> behavior: show, dim to a level, or hide.</li>
              <li><strong>Layout</strong> — <em>Vertical</em> (classic bar list) vs <em>Horizontal</em> orientation.</li>
              <li><strong>Values</strong> — <em>Sort by</em> DPS / HPS / DTPS / rDPS / Role (sorting follows this metric); <em>Format</em> raw (<code>12345</code>), short (<code>12.3k</code>) or comma (<code>12,345</code>).</li>
              <li><strong>Animation</strong> — <em>Transition</em> (bar movement smoothing, ms) and <em>Hold</em> (how long the meter lingers after combat, s). Set Transition to 0 for instant updates.</li>
              <li><strong>Rank #1</strong> — On/Off badge. Quick <em>Theme</em> presets (Gold Crown, Glowing Gold, Ruby Winner, Neon Winner, Minimal Gold, Ice Champion), <em>Height +</em> (taller top bar), <em>Bar Fill</em> solid/gradient, <em>Crown</em> (emoji or an uploaded image, with size / X-Y offset / rotation / anchors), <em>Glow</em>, gradient <em>Name</em>, and icon glow/shadow/backdrop.</li>
              <li>Font choice lives per-label under Bar Style → Label → Font. (The standalone Custom Fonts source manager is currently hidden.)</li>
            </ul>
          </details>
        </section>

        <!-- Pulls -->
        <section v-if="activeTab === 'pulls'">
          <div v-if="isLite" class="help-note">Lite build: the Pulls window and its data collection are disabled. Use the Full overlay for analysis.</div>
          <p class="help-lead">Separate <code>1300×840</code> window — keep the meter open while reviewing (it broadcasts the data).</p>
          <ul class="help-list">
            <li><strong>Open</strong> — header <em>Pulls</em> for the dashboard, or click a bar for that player.</li>
            <li><strong>Tabs</strong> — Overview | Pulls | Done | Taken | Timeline | Deaths | Casts | Events.</li>
            <li><strong>Pulls tab</strong> — session list grouped by encounter, Enemy Progress / Party rDPS / Deaths / Damage Taken cards, Quick Read + raid-buff warnings, Death Windows, Damage Attribution chart + table.</li>
            <li><strong>Loop</strong> — Pulls → low rDPS pull → attribution → player → Done → Timeline bucket → Deaths → Casts (missed mits).</li>
          </ul>
        </section>
      </div>

      <div class="help-footer">
        <span class="help-full-guide">Full guide: <a :href="GUIDE_URL" target="_blank" rel="noopener" class="help-link" @click.prevent="openExternalUrl(GUIDE_URL)">docs/USAGE.md</a></span>
        <span class="help-build">
          <a :href="buildHref" target="_blank" rel="noopener" :title="buildTitle" class="help-build-link" :class="{ 'is-dev': isDevBuild }" @click.prevent="openExternalUrl(buildHref)">{{ buildLabel }}</a><span v-if="buildDate" class="help-build-date" :title="build.time"> · {{ buildDate }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.help-modal {
  width: 680px; max-width: 100%; max-height: 86vh;
  display: flex; flex-direction: column;
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden;
}
.help-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
}
.help-title { font-size: 13px; font-weight: 700; color: #fff; }
.help-close {
  background: var(--bg-control); border: 1px solid var(--border);
  color: var(--text); border-radius: 4px; cursor: pointer;
  font-size: 11px; padding: 3px 8px;
}
.help-close:hover { background: var(--bg-hover); }
.help-tabs { display: flex; gap: 4px; padding: 8px 12px 0; }
.help-tab {
  background: transparent; border: 1px solid transparent; border-bottom: none;
  color: var(--text-muted); font-size: 11px; font-weight: 600;
  padding: 6px 12px; border-radius: 6px 6px 0 0; cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.help-tab:hover { color: var(--text); background: var(--bg-hover); }
.help-tab.active { color: #fff; background: var(--bg-control); border-color: var(--border); }
.help-body {
  padding: 12px 14px; overflow-y: auto; font-size: 12px; line-height: 1.55;
  border-top: 1px solid var(--border); color: var(--text);
}
.help-lead { color: var(--text-muted); margin: 0 0 8px; font-size: 12px; }
.help-list { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 4px; }
.help-list code, .help-footer code {
  font-family: ui-monospace, Consolas, monospace; font-size: 11px;
  background: var(--bg-control); padding: 1px 5px; border-radius: 3px;
}
.help-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0 8px; }
.help-table th, .help-table td {
  border: 1px solid var(--border); padding: 5px 8px; text-align: left;
}
.help-table th { background: var(--bg-control); font-size: 11px; }
.help-note {
  background: rgba(255, 209, 102, 0.1); border: 1px solid rgba(255, 209, 102, 0.3);
  color: #ffd166; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px; font-size: 12px;
}
.help-details {
  border: 1px solid var(--border); border-radius: 6px;
  margin: 8px 0; background: var(--bg-base);
}
.help-details summary {
  cursor: pointer; padding: 8px 12px; font-size: 12px; font-weight: 700;
  color: #fff; list-style: none; display: flex; align-items: center; gap: 8px;
  user-select: none;
}
.help-details summary::-webkit-details-marker { display: none; }
.help-details summary::before { content: '›'; color: var(--text-muted); transition: transform 0.15s; }
.help-details[open] summary::before { transform: rotate(90deg); }
.help-details summary:hover { background: var(--bg-hover); border-radius: 6px; }
.help-details[open] summary { border-bottom: 1px solid var(--border); border-radius: 6px 6px 0 0; }
.help-details .help-list, .help-details .help-note { margin: 8px 12px 12px; }
.help-details .help-note { margin: 8px 12px 0; }
.help-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; border-top: 1px solid var(--border);
  font-size: 11px; color: var(--text-muted);
}
.help-link, .help-build-link { color: var(--text-muted); text-decoration: none; border-bottom: 1px dotted var(--text-muted); }
a.help-link:hover, a.help-build-link:hover { color: #fff; border-bottom-color: #fff; }
.help-build-link.is-dev { border-bottom-style: dashed; }
.help-build-date { color: var(--text-muted); }
</style>
