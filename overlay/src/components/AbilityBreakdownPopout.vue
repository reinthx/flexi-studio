<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { formatValue } from '@shared/formatValue'
import type { CombatantAbilityData, DpsTimeline, DeathRecord, HitRecord } from '@shared/configSchema'
import { TIMELINE_BUCKET_SEC } from '@shared/configSchema'

interface PullEntry { index: number | null; encounterName: string; duration: string }

// ── State from main window ────────────────────────────────────────────────────
const allData             = ref<Record<string, CombatantAbilityData>>({})
const dpsTimeline         = ref<DpsTimeline>({})
const hpsTimeline         = ref<DpsTimeline>({})
const dtakenTimeline      = ref<DpsTimeline>({})
const selfName            = ref('')
const blurNames           = ref(false)
const partyNames          = ref<string[]>([])
const selected            = ref('')
const pullList            = ref<PullEntry[]>([])
const activePull          = ref<number | null>(null)
const activeView          = ref<'summary' | 'charts' | 'encounter' | 'deaths'>('summary')
const chartMetric         = ref<'dps' | 'hps' | 'dtps'>('dps')
const encounterDurationSec = ref(0)
const hiddenSeries        = ref<Set<string>>(new Set())
const damageTakenData     = ref<Record<string, CombatantAbilityData>>({})
const deaths              = ref<DeathRecord[]>([])
const combatantIds        = ref<Record<string, string>>({})
const showEnemies         = ref(false)
const summaryMode         = ref<'done' | 'taken'>('done')

// Track last pull index so we can reset hiddenSeries on pull change
let lastAutoHidePull: number | null | undefined = undefined

const initName = localStorage.getItem('flexi-breakdown-init') ?? ''

// ── Combatants / blur ─────────────────────────────────────────────────────────
const combatants = computed(() => Object.keys(allData.value))

function isEnemy(name: string): boolean {
  const id = combatantIds.value[name]
  return !!id && id.startsWith('40')
}

const visibleCombatants = computed(() =>
  combatants.value.filter(n => showEnemies.value || !isEnemy(n))
)

const resolvedSelected = computed(() => {
  const visible = visibleCombatants.value
  if (selected.value && allData.value[selected.value] && visible.includes(selected.value)) return selected.value
  if (initName && allData.value[initName] && visible.includes(initName)) return initName
  if (selfName.value && allData.value[selfName.value]) return selfName.value
  return visible[0] ?? ''
})

function tabLabel(name: string): string {
  return name === selfName.value ? `${name} (YOU)` : name
}

const blurTextStyle = {
  fontFamily: "'redacted-script-bold', monospace",
  filter: 'blur(1px)',
  userSelect: 'none' as const,
  letterSpacing: '-0.04em',
}

function nameStyle(name: string) {
  return blurNames.value && name !== selfName.value && name !== 'YOU'
    ? blurTextStyle : undefined
}

// ── Summary ───────────────────────────────────────────────────────────────────
const rawData = computed(() => allData.value[resolvedSelected.value] ?? {})

const playerTotal = computed(() =>
  Object.values(rawData.value).reduce((s, a) => s + a.totalDamage, 0)
)

const encounterTotal = computed(() =>
  Object.values(allData.value).reduce((sum, c) =>
    sum + Object.values(c).reduce((s, a) => s + a.totalDamage, 0), 0)
)

const abilities = computed(() =>
  Object.values(rawData.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    playerTotal.value > 0 ? ((a.totalDamage / playerTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      dps:    encounterDurationSec.value > 0 ? Math.round(a.totalDamage / encounterDurationSec.value) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

// ── Damage Taken (Summary "Taken" mode) ──────────────────────────────────────
const takenRawData = computed(() => damageTakenData.value[resolvedSelected.value] ?? {})

const takenTotal = computed(() =>
  Object.values(takenRawData.value).reduce((s, a) => s + a.totalDamage, 0)
)

const takenAbilities = computed(() =>
  Object.values(takenRawData.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    takenTotal.value > 0 ? ((a.totalDamage / takenTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      dps:    encounterDurationSec.value > 0 ? Math.round(a.totalDamage / encounterDurationSec.value) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

const activeTableRows  = computed(() => summaryMode.value === 'taken' ? takenAbilities.value  : abilities.value)
const activeTableTotal = computed(() => summaryMode.value === 'taken' ? takenTotal.value      : playerTotal.value)

// ── Deaths ────────────────────────────────────────────────────────────────────
const sortedDeaths = computed(() =>
  [...deaths.value]
    .filter(d => showEnemies.value || !d.targetId.startsWith('40'))
    .sort((a, b) => a.timestamp - b.timestamp)
)

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function deathSparkPoints(death: DeathRecord): string {
  const W = 120, H = 28
  const { hpSamples, timestamp } = death
  if (hpSamples.length < 2) return ''
  const tStart = timestamp - 30000
  return hpSamples
    .filter(s => s.t >= tStart)
    .map(s => {
      const x = Math.max(0, Math.min(W, ((s.t - tStart) / 30000) * W))
      const y = H - s.hp * H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// ── Encounter tab ─────────────────────────────────────────────────────────────
const encounterSelectedPlayer = ref('')

watch(activePull, () => { encounterSelectedPlayer.value = '' })

const currentEncounterName = computed(() =>
  pullList.value.find(e => e.index === activePull.value)?.encounterName ?? ''
)
const currentEncounterDuration = computed(() =>
  pullList.value.find(e => e.index === activePull.value)?.duration ?? ''
)

const dtakenPlayers = computed(() =>
  Object.keys(damageTakenData.value)
    .filter(n => !isEnemy(n))
    .map(n => ({
      name: n,
      total: Object.values(damageTakenData.value[n] ?? {}).reduce((s, a) => s + a.totalDamage, 0),
    }))
    .filter(p => p.total > 0)
    .sort((a, b) => b.total - a.total)
)

const dtakenPlayersMax = computed(() => dtakenPlayers.value[0]?.total ?? 1)

const dtakenEnemies = computed(() => {
  if (!showEnemies.value) return []
  return Object.keys(damageTakenData.value)
    .filter(n => isEnemy(n))
    .map(n => ({
      name: n,
      total: Object.values(damageTakenData.value[n] ?? {}).reduce((s, a) => s + a.totalDamage, 0),
    }))
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total)
})

const hasMultipleEnemies = computed(() => {
  const ids = Object.values(combatantIds.value).filter(id => id.startsWith('40'))
  return new Set(ids).size >= 2
})

const encSelectedResolved = computed(() =>
  encounterSelectedPlayer.value && damageTakenData.value[encounterSelectedPlayer.value]
    ? encounterSelectedPlayer.value
    : ''
)

const encTakenRaw = computed(() => damageTakenData.value[encSelectedResolved.value] ?? {})
const encTakenTotal = computed(() =>
  Object.values(encTakenRaw.value).reduce((s, a) => s + a.totalDamage, 0)
)
const encTakenAbilities = computed(() =>
  Object.values(encTakenRaw.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    encTakenTotal.value > 0 ? ((a.totalDamage / encTakenTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

const selectedDeathIndex = ref<number | null>(null)

watch([activePull, deaths], () => { selectedDeathIndex.value = null })

const selectedDeath = computed<DeathRecord | null>(() =>
  selectedDeathIndex.value !== null ? (sortedDeaths.value[selectedDeathIndex.value] ?? null) : null
)

const deathHitLog = computed(() => {
  if (!selectedDeath.value?.lastHits) return []
  const samples = selectedDeath.value.hpSamples
  return [...selectedDeath.value.lastHits]
    .sort((a, b) => a.t - b.t)
    .map(hit => {
      // Find last HP sample at or before this hit's timestamp
      let hp = 1
      for (const s of samples) {
        if (s.t <= hit.t) hp = s.hp
        else break
      }
      return { ...hit, hp }
    })
})

function hpBarColor(hp: number): string {
  if (hp > 0.5)  return 'rgba(80,200,80,0.13)'
  if (hp > 0.25) return 'rgba(220,190,50,0.13)'
  return 'rgba(210,70,70,0.16)'
}

// ── Pull selector ─────────────────────────────────────────────────────────────
function onPullSelect(e: Event): void {
  const val = (e.target as HTMLSelectElement).value
  const idx = val === 'null' ? null : parseInt(val, 10)
  activePull.value = idx
  channel?.postMessage({ type: 'loadPull', index: idx })
}

// ── Chart ─────────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  '#ff7675','#74b9ff','#55efc4','#fdcb6e',
  '#a29bfe','#fd79a8','#00cec9','#e17055',
]
const GROUP_NAME  = '__group__'
const GROUP_COLOR = 'rgba(255,255,255,0.7)'

// Auto-hide non-party members when pull changes (skip enemies — handled by showEnemies toggle)
function applyAutoHide(pullIdx: number | null | undefined, timeline: DpsTimeline): void {
  if (pullIdx === lastAutoHidePull) return
  lastAutoHidePull = pullIdx
  if (partyNames.value.length === 0) return
  const party = new Set([...partyNames.value, selfName.value, 'YOU'])
  const toHide = new Set<string>()
  for (const name of Object.keys(timeline)) {
    if (!party.has(name) && !isEnemy(name)) toHide.add(name)
  }
  hiddenSeries.value = toHide
}

function toggleSeries(name: string): void {
  const next = new Set(hiddenSeries.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  hiddenSeries.value = next
}

function smoothBuckets(buckets: number[], win = 4): number[] {
  return buckets.map((_, i) => {
    const start = Math.max(0, i - win + 1)
    const slice = buckets.slice(start, i + 1)
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}

const PL = 52, PR = 16, PT = 12, PB = 28
const SVG_W = 500, SVG_H = 240
const CW = SVG_W - PL - PR
const CH = SVG_H - PT - PB

const activeTimeline = computed<DpsTimeline>(() => {
  if (chartMetric.value === 'hps')  return hpsTimeline.value
  if (chartMetric.value === 'dtps') return dtakenTimeline.value
  return dpsTimeline.value
})

const metricLabel = computed(() =>
  chartMetric.value === 'hps' ? 'HPS' : chartMetric.value === 'dtps' ? 'DTPS' : 'DPS'
)

const chartLines = computed(() => {
  const timeline = activeTimeline.value
  const names = Object.keys(timeline)
  if (names.length === 0) return null

  const maxBuckets = Math.max(...names.map(n => (timeline[n] ?? []).length))
  if (maxBuckets < 2) return null

  const series = names
    .filter(n => showEnemies.value || !isEnemy(n))
    .map((name, i) => ({
      name,
      color: CHART_COLORS[i % CHART_COLORS.length],
      values: smoothBuckets(timeline[name] ?? []).map(v => v / TIMELINE_BUCKET_SEC),
      isGroup: false,
    }))

  // Group line = sum of all individual series per bucket
  const groupBuckets: number[] = Array(maxBuckets).fill(0)
  for (const s of series) {
    for (let i = 0; i < s.values.length; i++) groupBuckets[i] += s.values[i] ?? 0
  }
  const allSeries = [
    ...series,
    { name: GROUP_NAME, color: GROUP_COLOR, values: groupBuckets, isGroup: true },
  ]

  // Y max: highest visible value (individual or group)
  const visibleVals = allSeries
    .filter(s => !hiddenSeries.value.has(s.name))
    .flatMap(s => s.values)
  const maxDps = Math.max(...visibleVals, 1)

  function points(values: number[]): string {
    return values.map((v, i) => {
      const x = PL + (i / (maxBuckets - 1)) * CW
      const y = PT + CH - Math.min(v / maxDps, 1) * CH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  const yTicks = Array.from({ length: 5 }, (_, i) => ({
    y: PT + CH - (i / 4) * CH,
    label: formatValue(maxDps * (i / 4), 'abbreviated'),
  }))

  const xStep = Math.ceil(60 / TIMELINE_BUCKET_SEC)
  const xTicks: { x: number; label: string }[] = []
  for (let b = 0; b < maxBuckets; b += xStep) {
    const secs = b * TIMELINE_BUCKET_SEC
    const m = Math.floor(secs / 60), s = secs % 60
    xTicks.push({ x: PL + (b / (maxBuckets - 1)) * CW, label: `${m}:${String(s).padStart(2, '0')}` })
  }

  return { series: allSeries, maxBuckets, maxDps, points, yTicks, xTicks }
})

// ── Hover tooltip ─────────────────────────────────────────────────────────────
const svgRef      = ref<SVGSVGElement | null>(null)
const chartAreaRef = ref<HTMLDivElement | null>(null)
const hoverVisible = ref(false)
const hoverSvgX   = ref(0)
const hoverClientX = ref(0)
const hoverClientY = ref(0)

function onSvgMouseMove(e: MouseEvent): void {
  const svg  = svgRef.value
  const area = chartAreaRef.value
  if (!svg || !area) return
  const sr = svg.getBoundingClientRect()
  const ar = area.getBoundingClientRect()
  hoverSvgX.value   = ((e.clientX - sr.left) / sr.width) * SVG_W
  hoverClientX.value = e.clientX - ar.left
  hoverClientY.value = e.clientY - ar.top
  hoverVisible.value = hoverSvgX.value >= PL && hoverSvgX.value <= PL + CW
}

const hoverBucket = computed(() => {
  if (!hoverVisible.value || !chartLines.value) return -1
  const { maxBuckets } = chartLines.value
  if (maxBuckets < 2) return -1
  return Math.round(Math.max(0, Math.min(1, (hoverSvgX.value - PL) / CW)) * (maxBuckets - 1))
})

const hoverLineX = computed(() => {
  if (!chartLines.value || hoverBucket.value < 0) return 0
  return PL + (hoverBucket.value / (chartLines.value.maxBuckets - 1)) * CW
})

const hoverTooltip = computed(() => {
  if (!chartLines.value || hoverBucket.value < 0) return null
  const b = hoverBucket.value
  const secs = b * TIMELINE_BUCKET_SEC
  const m = Math.floor(secs / 60), s = secs % 60
  const timeLabel = `${m}:${String(s).padStart(2, '0')}`
  const entries = chartLines.value.series
    .filter(s => !s.isGroup && !hiddenSeries.value.has(s.name))
    .map(s => ({ name: s.name, label: tabLabel(s.name), color: s.color, value: s.values[b] ?? 0 }))
    .sort((a, b) => b.value - a.value)
  const groupVal = entries.reduce((sum, e) => sum + e.value, 0)
  return { timeLabel, entries, groupVal }
})

const tooltipStyle = computed(() => {
  if (!hoverVisible.value || !hoverTooltip.value || !chartAreaRef.value) return { display: 'none' }
  const areaW = chartAreaRef.value.clientWidth
  const W = 160
  const left = hoverClientX.value + 14 + W > areaW
    ? hoverClientX.value - W - 6
    : hoverClientX.value + 14
  const top = Math.max(4, Math.min(hoverClientY.value - 20, 60))
  return { display: 'block', left: `${left}px`, top: `${top}px` }
})

const f = (n: number) => formatValue(n, 'abbreviated')

// ── BroadcastChannel ──────────────────────────────────────────────────────────
let channel: BroadcastChannel | null = null

onMounted(() => {
  document.title = 'Ability Breakdown'
  if (typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel('flexi-breakdown')
  channel.onmessage = (e) => {
    if (e.data?.type === 'encounterData') {
      allData.value              = e.data.abilityData      ?? {}
      dpsTimeline.value          = e.data.dpsTimeline      ?? {}
      hpsTimeline.value          = e.data.hpsTimeline      ?? {}
      dtakenTimeline.value       = e.data.dtakenTimeline   ?? {}
      damageTakenData.value      = e.data.damageTakenData  ?? {}
      deaths.value               = e.data.deaths           ?? []
      combatantIds.value         = e.data.combatantIds     ?? {}
      selfName.value             = e.data.selfName         ?? ''
      blurNames.value            = e.data.blurNames        ?? false
      partyNames.value           = e.data.partyNames       ?? []
      encounterDurationSec.value = e.data.encounterDurationSec ?? 0
      pullList.value             = e.data.pullList         ?? []
      if ('pullIndex' in e.data) {
        activePull.value = e.data.pullIndex ?? null
        applyAutoHide(e.data.pullIndex ?? null, e.data.dpsTimeline ?? {})
      }
      if (e.data.selectedCombatant) {
        selected.value = e.data.selectedCombatant
      } else if (!selected.value && initName && allData.value[initName]) {
        selected.value = initName
      }
    } else if (e.data?.type === 'selectCombatant') {
      selected.value = e.data.name ?? ''
    }
  }
  channel.postMessage({ type: 'request' })
})

onUnmounted(() => { channel?.close(); channel = null })
</script>

<template>
  <div class="bp-root">

    <!-- Top bar -->
    <div class="bp-topbar">
      <span class="bp-app-title">Ability Breakdown</span>
      <select v-if="pullList.length > 0" class="bp-pull-select"
        :value="String(activePull)" @change="onPullSelect">
        <option v-for="entry in pullList" :key="String(entry.index)" :value="String(entry.index)">
          {{ entry.index === null ? '⬤ Live' : `${entry.encounterName}  ${entry.duration}` }}
        </option>
      </select>
      <button class="bp-toggle-btn" :class="{ active: showEnemies }" @click="showEnemies = !showEnemies" title="Show/hide enemies">
        Enemies
      </button>
      <span v-if="encounterTotal > 0" class="bp-total">{{ f(encounterTotal) }} tracked</span>
    </div>

    <!-- View tabs -->
    <div class="bp-view-tabs">
      <button class="bp-view-tab" :class="{ active: activeView === 'summary' }" @click="activeView = 'summary'">Summary</button>
      <button class="bp-view-tab" :class="{ active: activeView === 'charts' }" @click="activeView = 'charts'">Charts</button>
      <button class="bp-view-tab" :class="{ active: activeView === 'encounter' }" @click="activeView = 'encounter'">Encounter</button>
      <button class="bp-view-tab" :class="{ active: activeView === 'deaths' }" @click="activeView = 'deaths'">
        Deaths<span v-if="sortedDeaths.length > 0" class="bp-death-badge">{{ sortedDeaths.length }}</span>
      </button>
    </div>

    <div v-if="combatants.length === 0" class="bp-waiting">Waiting for combat data…</div>

    <!-- ── SUMMARY ── -->
    <template v-else-if="activeView === 'summary'">
      <div class="bp-tabs">
        <button v-for="name in visibleCombatants" :key="name" class="bp-tab"
          :class="{ active: resolvedSelected === name }" @click="selected = name">
          <span :style="nameStyle(name)">{{ tabLabel(name) }}</span>
        </button>
      </div>
      <div class="bp-summary-mode-bar">
        <button class="bp-mode-btn" :class="{ active: summaryMode === 'done' }" @click="summaryMode = 'done'">Done</button>
        <button class="bp-mode-btn" :class="{ active: summaryMode === 'taken' }" @click="summaryMode = 'taken'">Taken</button>
        <span class="bp-mode-total">{{ f(activeTableTotal) }}</span>
      </div>
      <div v-if="activeTableRows.length === 0" class="bp-waiting">No {{ summaryMode === 'taken' ? 'damage taken' : 'ability' }} data for this pull.</div>
      <div v-else class="bp-scroll">
        <table class="bp-table">
          <thead><tr>
            <th class="col-name">Ability</th>
            <th class="col-num">Damage</th>
            <th class="col-num">DPS</th>
            <th class="col-pct">%</th>
            <th class="col-num">Hits</th>
            <th class="col-num">Avg</th>
            <th class="col-num">Max</th>
            <th class="col-num col-dim">Min</th>
          </tr></thead>
          <tbody>
            <tr v-for="row in activeTableRows" :key="row.abilityId">
              <td class="col-name">
                <div class="row-fill" :style="{ width: row.pct + '%' }" />
                <span class="aname">{{ row.abilityName }}</span>
              </td>
              <td class="col-num">{{ f(row.totalDamage) }}</td>
              <td class="col-num">{{ encounterDurationSec > 0 ? f(row.dps) : '—' }}</td>
              <td class="col-pct">{{ row.pct }}%</td>
              <td class="col-num">{{ row.hits }}</td>
              <td class="col-num">{{ f(row.avg) }}</td>
              <td class="col-num">{{ f(row.maxHit) }}</td>
              <td class="col-num col-dim">{{ f(row.minHit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── CHARTS ── -->
    <template v-else-if="activeView === 'charts'">
      <!-- Metric selector -->
      <div class="bp-metric-tabs">
        <button class="bp-metric-tab" :class="{ active: chartMetric === 'dps' }"  @click="chartMetric = 'dps'">DPS</button>
        <button class="bp-metric-tab" :class="{ active: chartMetric === 'hps' }"  @click="chartMetric = 'hps'">HPS</button>
        <button class="bp-metric-tab" :class="{ active: chartMetric === 'dtps' }" @click="chartMetric = 'dtps'">DTPS</button>
      </div>

      <div v-if="!chartLines" class="bp-waiting">No {{ metricLabel }} data for this encounter.</div>
      <div v-else ref="chartAreaRef" class="bp-chart-area">

        <svg ref="svgRef" class="bp-chart-svg"
          :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
          preserveAspectRatio="xMidYMid meet"
          @mousemove="onSvgMouseMove"
          @mouseleave="hoverVisible = false">

          <!-- Y gridlines -->
          <g v-for="tick in chartLines.yTicks" :key="tick.y">
            <line :x1="PL" :y1="tick.y" :x2="PL + CW" :y2="tick.y" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
            <text :x="PL - 5" :y="tick.y + 4" text-anchor="end" class="axis-label">{{ tick.label }}</text>
          </g>
          <!-- X gridlines -->
          <g v-for="tick in chartLines.xTicks" :key="tick.x">
            <line :x1="tick.x" :y1="PT" :x2="tick.x" :y2="PT + CH" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
            <text :x="tick.x" :y="PT + CH + 14" text-anchor="middle" class="axis-label">{{ tick.label }}</text>
          </g>
          <rect :x="PL" :y="PT" :width="CW" :height="CH" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />

          <!-- DPS lines -->
          <polyline
            v-for="s in chartLines.series"
            v-show="!hiddenSeries.has(s.name)"
            :key="s.name"
            :points="chartLines.points(s.values)"
            fill="none"
            :stroke="s.color"
            :stroke-width="s.isGroup ? 1.5 : 1.5"
            :stroke-dasharray="s.isGroup ? '5,3' : undefined"
            stroke-linejoin="round"
            stroke-linecap="round"
            :opacity="s.isGroup ? 0.6 : 1"
          />

          <!-- Hover: vertical line -->
          <line v-show="hoverVisible && hoverBucket >= 0"
            :x1="hoverLineX" :y1="PT" :x2="hoverLineX" :y2="PT + CH"
            stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="3,3" />

          <!-- Hover: dots on each visible line -->
          <circle
            v-for="s in chartLines.series.filter(s => !s.isGroup && !hiddenSeries.has(s.name))"
            v-show="hoverVisible && hoverBucket >= 0"
            :key="`dot-${s.name}`"
            :cx="hoverLineX"
            :cy="PT + CH - Math.min((s.values[hoverBucket] ?? 0) / chartLines.maxDps, 1) * CH"
            r="3" :fill="s.color" stroke="#0d0d10" stroke-width="1.5"
          />
        </svg>

        <!-- Hover tooltip -->
        <div class="bp-tooltip" :style="tooltipStyle" v-if="hoverTooltip">
          <div class="bp-tooltip-time">{{ hoverTooltip.timeLabel }}</div>
          <div v-for="entry in hoverTooltip.entries" :key="entry.name" class="bp-tooltip-row">
            <span class="bp-tooltip-dot" :style="{ background: entry.color }" />
            <span class="bp-tooltip-name" :style="nameStyle(entry.name)">{{ entry.label }}</span>
            <span class="bp-tooltip-val">{{ f(entry.value) }}</span>
          </div>
          <div v-if="hoverTooltip.entries.length > 1" class="bp-tooltip-group">
            <span class="bp-tooltip-name">Group</span>
            <span class="bp-tooltip-val">{{ f(hoverTooltip.groupVal) }}</span>
          </div>
        </div>

        <!-- Legend -->
        <div class="bp-chart-legend">
          <div v-for="s in chartLines.series" :key="s.name"
            class="bp-legend-item" :class="{ hidden: hiddenSeries.has(s.name) }"
            @click="toggleSeries(s.name)">
            <span class="bp-legend-dot"
              :style="{ background: s.isGroup ? 'transparent' : s.color,
                        border: s.isGroup ? `1px dashed ${GROUP_COLOR}` : 'none' }" />
            <span class="bp-legend-name"
              :style="s.isGroup ? undefined : nameStyle(s.name)">
              {{ s.isGroup ? 'Group' : tabLabel(s.name) }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- ── ENCOUNTER ── -->
    <template v-else-if="activeView === 'encounter'">

      <!-- Encounter name header -->
      <div class="enc-header" v-if="currentEncounterName">
        <span class="enc-name">{{ currentEncounterName }}</span>
        <span class="enc-dur" v-if="currentEncounterDuration">{{ currentEncounterDuration }}</span>
      </div>

      <!-- Main two-column area -->
      <div class="enc-main">

        <!-- Left: Damage Taken per player -->
        <div class="enc-left">
          <div class="enc-section-label">Damage Taken</div>
          <div class="enc-player-list">
            <div v-if="dtakenPlayers.length === 0" class="enc-empty-small">No data yet</div>
            <div
              v-for="p in dtakenPlayers" :key="p.name"
              class="enc-player-row"
              :class="{ active: encSelectedResolved === p.name }"
              @click="encounterSelectedPlayer = p.name"
            >
              <div class="enc-fill" :style="{ width: (p.total / dtakenPlayersMax * 100).toFixed(1) + '%' }" />
              <span class="enc-player-name" :style="nameStyle(p.name)">{{ tabLabel(p.name) }}</span>
              <span class="enc-player-val">{{ f(p.total) }}</span>
            </div>

            <!-- Adds: show only when enemies toggle on AND fight had multiple enemies -->
            <template v-if="showEnemies && hasMultipleEnemies && dtakenEnemies.length > 0">
              <div class="enc-section-label enc-section-label--adds">Adds</div>
              <div
                v-for="e in dtakenEnemies" :key="e.name"
                class="enc-player-row enc-enemy-row"
                :class="{ active: encSelectedResolved === e.name }"
                @click="encounterSelectedPlayer = e.name"
              >
                <div class="enc-fill enc-fill--enemy" :style="{ width: (e.total / dtakenPlayersMax * 100).toFixed(1) + '%' }" />
                <span class="enc-player-name">{{ e.name }}</span>
                <span class="enc-player-val">{{ f(e.total) }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- Right: Per-ability breakdown -->
        <div class="enc-right">
          <div v-if="!encSelectedResolved" class="enc-select-prompt">Select a player to review</div>
          <template v-else>
            <div class="enc-ability-header">
              <span class="enc-ability-player" :style="nameStyle(encSelectedResolved)">{{ tabLabel(encSelectedResolved) }}</span>
              <span class="enc-ability-total">{{ f(encTakenTotal) }} taken</span>
            </div>
            <div v-if="encTakenAbilities.length === 0" class="enc-empty-small">No ability data</div>
            <div v-else class="enc-ability-scroll">
              <table class="bp-table">
                <thead><tr>
                  <th class="col-name">Ability</th>
                  <th class="col-num">Damage</th>
                  <th class="col-pct">%</th>
                  <th class="col-num">Hits</th>
                  <th class="col-num">Avg</th>
                  <th class="col-num">Max</th>
                </tr></thead>
                <tbody>
                  <tr v-for="row in encTakenAbilities" :key="row.abilityId">
                    <td class="col-name">
                      <div class="row-fill enc-row-fill" :style="{ width: row.pct + '%' }" />
                      <span class="aname">{{ row.abilityName }}</span>
                    </td>
                    <td class="col-num">{{ f(row.totalDamage) }}</td>
                    <td class="col-pct">{{ row.pct }}%</td>
                    <td class="col-num">{{ row.hits }}</td>
                    <td class="col-num">{{ f(row.avg) }}</td>
                    <td class="col-num">{{ f(row.maxHit) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </div>

    </template>

    <!-- ── DEATHS ── -->
    <template v-else-if="activeView === 'deaths'">
      <div v-if="sortedDeaths.length === 0" class="bp-waiting">No deaths recorded this pull.</div>
      <div v-else class="dl-root">

        <!-- Left: death list -->
        <div class="dl-list">
          <div
            v-for="(death, i) in sortedDeaths" :key="i"
            class="dl-death-row"
            :class="{ active: selectedDeathIndex === i }"
            @click="selectedDeathIndex = selectedDeathIndex === i ? null : i"
          >
            <div class="dl-death-info">
              <span class="dl-death-name" :style="nameStyle(death.targetName)">{{ death.targetName }}</span>
              <span class="dl-death-time">{{ fmtTime(death.timestamp) }}</span>
            </div>
            <div class="dl-spark">
              <svg v-if="deathSparkPoints(death)" viewBox="0 0 120 28" preserveAspectRatio="none"
                width="120" height="28" class="bp-spark-svg">
                <line x1="0" y1="28" x2="120" y2="28" stroke="rgba(255,255,255,0.07)" stroke-width="1" />
                <polyline :points="deathSparkPoints(death)"
                  fill="none" stroke="#ff6b6b" stroke-width="1.5"
                  stroke-linejoin="round" stroke-linecap="round" />
                <line x1="120" y1="0" x2="120" y2="28" stroke="rgba(255,100,100,0.5)" stroke-width="1" stroke-dasharray="2,2" />
              </svg>
              <span v-else class="bp-spark-none">no HP data</span>
            </div>
          </div>
        </div>

        <!-- Right: hit log for selected death -->
        <div class="dl-detail">
          <div v-if="!selectedDeath" class="dl-detail-empty">Select a death to review</div>
          <template v-else>
            <div class="dl-detail-header">
              <span class="dl-detail-name" :style="nameStyle(selectedDeath.targetName)">{{ selectedDeath.targetName }}</span>
              <span class="dl-detail-time">died @ {{ fmtTime(selectedDeath.timestamp) }}</span>
              <span class="dl-detail-sub">last 30s</span>
            </div>
            <div v-if="deathHitLog.length === 0" class="dl-detail-empty">No hit data recorded.</div>
            <div v-else class="dl-hit-scroll">
              <table class="dl-hit-table">
                <thead><tr>
                  <th class="dl-col-time">Time</th>
                  <th class="dl-col-type"></th>
                  <th class="dl-col-ability">Ability</th>
                  <th class="dl-col-source">Source</th>
                  <th class="dl-col-amount">Amount</th>
                </tr></thead>
                <tbody>
                  <tr
                    v-for="(hit, hi) in deathHitLog" :key="hi"
                    :class="hit.type === 'heal' ? 'dl-row-heal' : 'dl-row-dmg'"
                    :style="{ background: `linear-gradient(to right, ${hpBarColor(hit.hp)} ${(hit.hp * 100).toFixed(1)}%, transparent ${(hit.hp * 100).toFixed(1)}%)` }"
                  >
                    <td class="dl-col-time">{{ fmtTime(hit.t) }}</td>
                    <td class="dl-col-type">
                      <span :class="hit.type === 'heal' ? 'dl-badge-heal' : 'dl-badge-dmg'">
                        {{ hit.type === 'heal' ? 'H' : 'D' }}
                      </span>
                    </td>
                    <td class="dl-col-ability">{{ hit.abilityName }}</td>
                    <td class="dl-col-source">{{ hit.sourceName }}</td>
                    <td class="dl-col-amount" :class="hit.type === 'heal' ? 'dl-amount-heal' : 'dl-amount-dmg'">
                      {{ hit.type === 'heal' ? '+' : '-' }}{{ f(hit.amount) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

      </div>
    </template>

  </div>
</template>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }
.bp-root {
  width: 100vw; height: 100vh;
  background: #0d0d10;
  color: rgba(255,255,255,0.85);
  font-family: 'Segoe UI', monospace, sans-serif;
  font-size: 12px;
  display: flex; flex-direction: column; overflow: hidden;
}

/* ── Top bar ── */
.bp-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.bp-app-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); letter-spacing: 0.03em; white-space: nowrap; }
.bp-total { font-size: 11px; color: rgba(255,255,255,0.3); margin-left: auto; white-space: nowrap; }
.bp-pull-select {
  flex: 1; min-width: 0;
  background: #1a1a24;
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
  font-family: inherit; font-size: 11px;
  padding: 2px 6px; border-radius: 3px;
  cursor: pointer; outline: none; color-scheme: dark;
}
.bp-pull-select option { background: #1a1a24; color: rgba(255,255,255,0.85); }
.bp-pull-select:focus { border-color: rgba(100,180,255,0.4); }

/* ── View tabs ── */
.bp-view-tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.bp-view-tab {
  background: transparent; border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.35);
  padding: 5px 14px; cursor: pointer;
  font-size: 11px; font-family: inherit;
  letter-spacing: 0.04em;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.bp-view-tab:hover { color: rgba(255,255,255,0.65); }
.bp-view-tab.active { color: #ffd250; border-bottom-color: #ffd250; }

/* ── Combatant tabs ── */
.bp-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.bp-tab { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); padding: 3px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; font-family: inherit; transition: all 0.15s; }
.bp-tab:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
.bp-tab.active { background: rgba(255,210,80,0.15); border-color: rgba(255,210,80,0.4); color: #ffd250; }

/* ── Metric tabs ── */
.bp-metric-tabs { display: flex; gap: 0; padding: 4px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.bp-metric-tab {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4);
  padding: 2px 12px; border-radius: 3px;
  cursor: pointer; font-size: 10px; font-family: inherit;
  letter-spacing: 0.06em;
  transition: all 0.15s; margin-right: 3px;
}
.bp-metric-tab:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
.bp-metric-tab.active { background: rgba(100,180,255,0.15); border-color: rgba(100,180,255,0.4); color: #64b4ff; }

/* ── Waiting ── */
.bp-waiting { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.25); font-size: 13px; }

/* ── Summary table ── */
.bp-scroll { flex: 1; overflow-y: auto; }
.bp-table { width: 100%; border-collapse: collapse; }
.bp-table thead tr { border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; background: #0d0d10; z-index: 1; }
.bp-table th { padding: 5px 8px; font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.05em; text-align: right; white-space: nowrap; }
.bp-table th.col-name { text-align: left; }
.bp-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); }
.bp-table tbody tr:hover { background: rgba(255,255,255,0.04); }
td { padding: 4px 8px; text-align: right; font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.75); }
td.col-name { text-align: left; position: relative; max-width: 160px; }
.row-fill { position: absolute; inset: 0; right: auto; background: rgba(255,255,255,0.05); pointer-events: none; min-width: 2px; }
.aname { position: relative; z-index: 1; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-pct { color: rgba(255,210,80,0.9); }
.col-dim { color: rgba(255,255,255,0.3); }

/* ── Chart area ── */
.bp-chart-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 8px 10px 4px; gap: 4px; position: relative; }
.bp-chart-svg { width: 100%; flex: 1; min-height: 0; overflow: visible; }
.axis-label { font-size: 9px; fill: rgba(255,255,255,0.3); font-family: 'Segoe UI', monospace, sans-serif; }

/* ── Tooltip ── */
.bp-tooltip {
  position: absolute;
  background: rgba(10,10,16,0.92);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 6px 9px;
  pointer-events: none;
  z-index: 10;
  min-width: 140px;
}
.bp-tooltip-time { font-size: 11px; font-weight: 600; color: #ffd250; margin-bottom: 4px; }
.bp-tooltip-row { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; }
.bp-tooltip-group {
  display: flex; align-items: center; gap: 5px;
  margin-top: 4px; padding-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.bp-tooltip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.bp-tooltip-name { flex: 1; font-size: 10px; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-tooltip-val { font-size: 10px; font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.85); margin-left: auto; }

/* ── Legend ── */
.bp-chart-legend { display: flex; flex-wrap: wrap; gap: 3px 10px; flex-shrink: 0; padding-bottom: 2px; }
.bp-legend-item { display: flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; transition: opacity 0.15s; }
.bp-legend-item:hover { opacity: 0.75; }
.bp-legend-item.hidden { opacity: 0.3; }
.bp-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.bp-legend-name { font-size: 11px; color: rgba(255,255,255,0.65); white-space: nowrap; }

/* ── Show Enemies toggle ── */
.bp-toggle-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.35);
  font-size: 10px; font-family: inherit;
  padding: 2px 8px; border-radius: 3px; cursor: pointer;
  white-space: nowrap; letter-spacing: 0.04em;
  transition: all 0.15s;
}
.bp-toggle-btn:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.09); }
.bp-toggle-btn.active { background: rgba(255,160,60,0.15); border-color: rgba(255,160,60,0.4); color: #ffb347; }

/* ── Deaths tab badge ── */
.bp-death-badge {
  display: inline-block;
  background: rgba(255,100,100,0.3);
  color: #ff8080;
  font-size: 9px; line-height: 1;
  padding: 1px 4px; border-radius: 8px;
  margin-left: 4px; vertical-align: middle;
}

/* ── Summary mode bar ── */
.bp-summary-mode-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.bp-mode-btn {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4);
  font-size: 10px; font-family: inherit;
  padding: 2px 10px; border-radius: 3px; cursor: pointer;
  letter-spacing: 0.05em; transition: all 0.15s;
}
.bp-mode-btn:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
.bp-mode-btn.active { background: rgba(100,180,255,0.15); border-color: rgba(100,180,255,0.4); color: #64b4ff; }
.bp-mode-total { margin-left: auto; font-size: 11px; color: rgba(255,255,255,0.3); font-variant-numeric: tabular-nums; }

/* ── Encounter tab ── */
.enc-header {
  display: flex; align-items: baseline; gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.enc-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.enc-dur  { font-size: 10px; color: rgba(255,255,255,0.35); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }

.enc-main {
  flex: 1; min-height: 0;
  display: flex; overflow: hidden;
}

.enc-left {
  width: 195px; flex-shrink: 0;
  display: flex; flex-direction: column; overflow: hidden;
  border-right: 1px solid rgba(255,255,255,0.07);
}

.enc-right {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; overflow: hidden;
}

.enc-section-label {
  padding: 3px 8px;
  font-size: 9px; font-weight: 600;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase; letter-spacing: 0.08em;
  background: rgba(255,255,255,0.025);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  display: flex; align-items: center; gap: 5px;
}
.enc-section-label--adds {
  color: rgba(255,160,60,0.45);
  background: rgba(255,160,60,0.03);
  border-top: 1px solid rgba(255,255,255,0.05);
}
.enc-section-label--death {
  border-top: none;
}

.enc-player-list { flex: 1; overflow-y: auto; }

.enc-player-row {
  position: relative;
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  min-height: 26px;
  transition: background 0.1s;
}
.enc-player-row:hover   { background: rgba(255,255,255,0.04); }
.enc-player-row.active  { background: rgba(255,210,80,0.07); }

.enc-fill {
  position: absolute; inset: 0; right: auto;
  background: rgba(220,70,70,0.14);
  pointer-events: none;
  min-width: 2px;
  transition: width 0.25s ease;
}
.enc-fill--enemy { background: rgba(255,160,60,0.10); }

.enc-player-name {
  position: relative; z-index: 1;
  font-size: 11px; color: rgba(255,255,255,0.8);
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.enc-player-val {
  position: relative; z-index: 1;
  font-size: 10px; color: rgba(255,255,255,0.4);
  font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0;
}
.enc-player-row.active .enc-player-name { color: #ffd250; }
.enc-player-row.active .enc-player-val  { color: rgba(255,210,80,0.55); }

.enc-select-prompt {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.2); font-size: 12px; text-align: center; padding: 16px;
}

.enc-ability-header {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.enc-ability-player {
  font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8);
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.enc-ability-total {
  font-size: 10px; color: rgba(255,255,255,0.35);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

.enc-ability-scroll { flex: 1; overflow-y: auto; }

/* Ability fill in the right panel — red-tinted instead of white */
.enc-row-fill { background: rgba(220,70,70,0.10); }

.enc-empty-small {
  padding: 14px 8px; font-size: 10px;
  color: rgba(255,255,255,0.2); text-align: center;
}

/* Death section pinned at bottom of encounter tab */
.enc-death-section {
  flex-shrink: 0;
  max-height: 33%;
  display: flex; flex-direction: column; overflow: hidden;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.enc-death-empty {
  padding: 8px 10px; font-size: 10px; color: rgba(255,255,255,0.2);
}
.enc-death-list { overflow-y: auto; flex: 1; }

/* ── Deaths tab (dedicated) ── */
.dl-root {
  flex: 1; min-height: 0;
  display: flex; overflow: hidden;
}

/* Left: death list */
.dl-list {
  width: 210px; flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid rgba(255,255,255,0.07);
}
.dl-death-row {
  display: flex; flex-direction: column; gap: 4px;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: background 0.1s;
}
.dl-death-row:hover  { background: rgba(255,255,255,0.04); }
.dl-death-row.active { background: rgba(255,100,100,0.08); }
.dl-death-info { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.dl-death-name { font-size: 12px; color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-death-time { font-size: 10px; color: rgba(255,100,100,0.7); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.dl-spark { display: flex; align-items: center; }

/* Right: hit log detail */
.dl-detail {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; overflow: hidden;
}
.dl-detail-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.2); font-size: 12px; text-align: center; padding: 16px;
}
.dl-detail-header {
  display: flex; align-items: baseline; gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.dl-detail-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-detail-time { font-size: 10px; color: rgba(255,100,100,0.65); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.dl-detail-sub  { font-size: 10px; color: rgba(255,255,255,0.25); margin-left: auto; white-space: nowrap; }

.dl-hit-scroll { flex: 1; overflow-y: auto; }
.dl-hit-table {
  width: 100%; border-collapse: collapse;
  font-size: 11px;
}
.dl-hit-table thead tr { border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; background: #0d0d10; z-index: 1; }
.dl-hit-table th {
  padding: 4px 7px; font-size: 9px; font-weight: 500;
  color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.05em;
  text-align: left; white-space: nowrap;
}
.dl-col-amount { text-align: right; }
.dl-hit-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.03); }
.dl-hit-table td {
  padding: 3px 7px; white-space: nowrap;
  font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.7);
}
.dl-row-dmg:hover  { background: rgba(220,70,70,0.06); }
.dl-row-heal:hover { background: rgba(80,200,100,0.06); }

.dl-badge-dmg  { display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: rgba(220,70,70,0.3); color: #ff8080; font-size: 9px; font-weight: 700; text-align: center; line-height: 14px; }
.dl-badge-heal { display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: rgba(80,200,100,0.25); color: #6ee87a; font-size: 9px; font-weight: 700; text-align: center; line-height: 14px; }

.dl-amount-dmg  { color: rgba(255,130,130,0.9); text-align: right; }
.dl-amount-heal { color: rgba(110,232,122,0.9); text-align: right; }

.dl-col-time    { width: 36px; color: rgba(255,255,255,0.35) !important; }
.dl-col-type    { width: 20px; }
.dl-col-ability { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.dl-col-source  { max-width: 100px; overflow: hidden; text-overflow: ellipsis; color: rgba(255,255,255,0.45) !important; }

/* Legacy death row (used in encounter tab's death section if restored) */
.bp-death-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.bp-death-row:hover { background: rgba(255,255,255,0.03); }
.bp-death-left { display: flex; flex-direction: column; gap: 2px; }
.bp-death-name { font-size: 12px; color: rgba(255,255,255,0.8); }
.bp-death-time { font-size: 10px; color: rgba(255,100,100,0.7); font-variant-numeric: tabular-nums; }
.bp-death-spark { display: flex; align-items: center; }
.bp-spark-svg { display: block; }
.bp-spark-none { font-size: 10px; color: rgba(255,255,255,0.2); }
</style>
