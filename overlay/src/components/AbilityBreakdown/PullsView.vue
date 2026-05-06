<script setup lang="ts">
import type { DeathRecord } from '@shared/configSchema'
import type { PullGroupDpsBar } from './timelineSummary'
import type { NameStyleFn, PullEntry } from './types'
import type { PullDamageRow } from './pullInsights'

defineProps<{
  pullList: PullEntry[]
  activePull: number | null
  selectedPullEntry: PullEntry | null
  previousPullEntry: PullEntry | null
  enemyProgressHeadline: string
  enemyProgressMeta: string
  enemyProgressDetail: string
  sortedDeaths: DeathRecord[]
  deathClustersForCurrent: unknown[]
  pullDashboardNotes: string[]
  buffWarnings: string[]
  encounterDurationLabel: string
  pullGroupDpsBars: PullGroupDpsBar[]
  pullDamageRows: PullDamageRow[]
  resolvedSelected: string
  f: (value: number) => string
  fmtTime: (ms: number) => string
  fmtSeconds: (seconds: number) => string
  formatEntryDelta: (value: number, format: (value: number) => string) => string
  parseEntryDuration: (entry: PullEntry | null) => number
  entryPullLabel: (entry: PullEntry) => string
  pullOutcomeClass: (entry: PullEntry) => string
  nameStyle: NameStyleFn
  actorJobIcon: (name: string) => string
}>()

const emit = defineEmits<{
  selectPull: [entry: PullEntry]
  openDeath: [death: DeathRecord]
  openTimelineBucket: [bucket: number]
  openActor: [name: string]
}>()
</script>

<template>
  <div class="bp-pulls-workspace bp-pulls-workspace--scrollable">
    <aside class="bp-pull-list-panel">
      <div class="bp-panel-title">Session Pulls</div>
      <button v-for="entry in pullList" :key="String(entry.index)" class="bp-pull-row" :class="{ active: activePull === entry.index }" @click="emit('selectPull', entry)">
        <span v-if="entry.index !== null && entry.isFirstInEncounter" class="bp-pull-encounter-header">{{ entry.encounterName }} · {{ entry.pullCount ?? 1 }} pull{{ (entry.pullCount ?? 1) === 1 ? '' : 's' }}</span>
        <span class="bp-pull-row-main"><strong>{{ entryPullLabel(entry) }}</strong><span>{{ entry.index === null ? (entry.primaryEnemyName ?? entry.encounterName) : entry.encounterName }}</span></span>
        <span class="bp-pull-row-stats">
          <span>{{ entry.duration || '0:00' }}</span>
          <span v-if="entry.pullOutcomeLabel" :class="pullOutcomeClass(entry)">{{ entry.pullOutcomeLabel }}</span>
          <span v-if="entry.bossPercentLabel">{{ entry.bossPercentLabel }} enemy</span>
          <span v-if="entry.pullOutcome === 'wipe' && entry.primaryEnemyCurrentHp !== undefined">HP {{ f(entry.primaryEnemyCurrentHp) }}</span>
          <span v-else-if="entry.pullOutcome === 'clear' && entry.primaryEnemyMaxHp">Max {{ f(entry.primaryEnemyMaxHp) }}</span>
          <span>{{ f(entry.dps ?? 0) }} DPS</span>
          <span title="Raid-contributing DPS adjusted by buff credit">{{ f(entry.rdps ?? entry.dps ?? 0) }} rDPS</span>
          <span :class="{ danger: (entry.deaths ?? 0) > 0 }">{{ entry.deaths ?? 0 }} deaths</span>
        </span>
      </button>
    </aside>

    <main class="bp-main bp-main--pulls-pane">
      <div class="bp-card-grid">
        <div class="bp-card bp-card--taken bp-card--progress">
          <div class="bp-card-label">Enemy Progress</div>
          <div class="bp-card-progress-copy"><div class="bp-card-value bp-card-value--progress">{{ enemyProgressHeadline }}</div><div class="bp-card-detail bp-card-detail--progress">{{ enemyProgressMeta }}</div></div>
          <div class="bp-card-detail bp-card-detail--split">{{ enemyProgressDetail }}</div>
        </div>
        <div class="bp-card bp-card--done">
          <div class="bp-card-label">Party rDPS</div>
          <div class="bp-card-value">{{ f(selectedPullEntry?.rdps ?? selectedPullEntry?.dps ?? 0) }}</div>
          <div class="bp-card-detail"><template v-if="previousPullEntry">{{ formatEntryDelta((selectedPullEntry?.rdps ?? selectedPullEntry?.dps ?? 0) - (previousPullEntry.rdps ?? previousPullEntry.dps ?? 0), f) }} vs previous</template><template v-else>{{ f(selectedPullEntry?.dps ?? 0) }} DPS</template></div>
        </div>
        <div class="bp-card bp-card--deaths">
          <div class="bp-card-label">Deaths</div>
          <div class="bp-card-value">{{ selectedPullEntry?.deaths ?? sortedDeaths.length }}</div>
          <div class="bp-card-detail">{{ deathClustersForCurrent.length > 0 ? `${deathClustersForCurrent.length} death cluster${deathClustersForCurrent.length === 1 ? '' : 's'}` : 'no clustered deaths' }}</div>
        </div>
        <div class="bp-card bp-card--taken">
          <div class="bp-card-label">Damage Taken</div>
          <div class="bp-card-value">{{ f(selectedPullEntry?.damageTaken ?? 0) }}</div>
          <div class="bp-card-detail">{{ f(selectedPullEntry?.dtps ?? 0) }} DTPS</div>
        </div>
      </div>

      <div class="bp-pulls-grid">
        <section class="bp-panel">
          <div class="bp-panel-title">Quick Read</div>
          <div class="bp-pull-note-list"><div v-for="note in pullDashboardNotes" :key="note" class="bp-pull-note">{{ note }}</div><div v-for="warn in buffWarnings" :key="warn" class="bp-pull-note" style="color: #f87171;">{{ warn }}</div></div>
        </section>
        <section class="bp-panel">
          <div class="bp-panel-title">Death Windows</div>
          <div v-if="sortedDeaths.length === 0" class="bp-empty-panel">No deaths recorded for this pull.</div>
          <button v-for="death in sortedDeaths.slice(0, 8)" :key="`${death.targetName}-${death.timestamp}`" class="bp-event-item" @click="emit('openDeath', death)">
            <span class="bp-event-name" :style="nameStyle(death.targetName)">{{ death.targetName }}</span>
            <span class="bp-event-detail">{{ fmtTime(death.timestamp) }}{{ death.resurrectTime ? ` · raised ${fmtTime(death.resurrectTime)}` : ' · no raise seen' }}</span>
          </button>
        </section>
        <section class="bp-panel bp-panel--wide">
          <div class="bp-panel-title">Damage Attribution</div>
          <div class="bp-panel-toolbar bp-panel-toolbar--summary">
            <div class="bp-toolbar-stat"><span class="bp-toolbar-stat-label">Duration</span><strong>{{ selectedPullEntry?.duration || encounterDurationLabel }}</strong></div>
            <div class="bp-toolbar-context"><template v-if="previousPullEntry">{{ formatEntryDelta(parseEntryDuration(selectedPullEntry) - parseEntryDuration(previousPullEntry), fmtSeconds) }} vs previous</template><template v-else>current pull context</template></div>
          </div>
          <div class="bp-pull-attribution-chart" :class="{ empty: pullGroupDpsBars.length === 0 }">
            <button v-for="bar in pullGroupDpsBars" :key="bar.key" class="bp-pull-dps-bar" :style="{ height: bar.height }" :title="`${bar.label} · ${f(bar.value)} group DPS`" @click="emit('openTimelineBucket', bar.bucket)">
              <span v-if="bar.deathCount > 0" class="bp-pull-marker bp-pull-marker--death" :title="`${bar.deathCount} death${bar.deathCount === 1 ? '' : 's'}`"></span>
              <span v-if="bar.raiseCount > 0" class="bp-pull-marker bp-pull-marker--raise" :title="`${bar.raiseCount} raise${bar.raiseCount === 1 ? '' : 's'}`"></span>
            </button>
            <span v-if="pullGroupDpsBars.length === 0">No group DPS samples yet.</span>
          </div>
          <div v-if="pullDamageRows.length === 0" class="bp-empty-panel">No damage attribution rows for this pull.</div>
          <div v-else class="bp-scroll">
            <table class="bp-table bp-attribution-table">
              <thead><tr><th class="col-name">Name</th><th class="col-num">Amount</th><th class="col-pct">%</th><th class="col-num">DPS</th><th class="col-num">rDPS</th><th class="col-num">Given</th><th class="col-num">Taken</th><th class="col-num">Deaths</th></tr></thead>
              <tbody>
                <tr v-for="row in pullDamageRows" :key="`pull-damage-${row.name}`" :class="{ 'bp-row-active': resolvedSelected === row.name }" @click="emit('openActor', row.name)">
                  <td class="col-name"><div class="row-fill" :style="{ width: row.width }" /><span class="aname bp-player-cell" :style="nameStyle(row.name)"><img v-if="actorJobIcon(row.name)" :src="actorJobIcon(row.name)" alt="" class="bp-job-icon bp-player-cell-icon" /><span class="bp-player-cell-name">{{ row.name }}</span></span></td>
                  <td class="col-num">{{ f(row.total) }}</td><td class="col-pct">{{ row.pct }}%</td><td class="col-num">{{ f(row.dps) }}</td><td class="col-num">{{ f(row.rdps) }}</td><td class="col-num">{{ row.given > 0 ? f(row.given) : '—' }}</td><td class="col-num">{{ row.taken > 0 ? f(row.taken) : '—' }}</td><td class="col-num" :class="{ danger: row.deaths > 0 }">{{ row.deaths || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
