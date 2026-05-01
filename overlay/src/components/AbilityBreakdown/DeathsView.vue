<script setup lang="ts">
import type { CastEvent, DeathEvent, DeathRecord } from '@shared/configSchema'
import AbilityCell from './AbilityCell.vue'
import InspectorList from './InspectorList.vue'
import InspectorRows from './InspectorRows.vue'
import type { DeathInspectorRow, DeathRelatedDamageRow, DeathWindow } from './deathTransforms'
import type { NameStyleFn } from './types'

type DeathInspectorTab = 'recap' | 'context' | 'related'
type DeathHpBar = { x: number; width: number; hpBefore: number; hpAfter: number; type: 'dmg' | 'heal' | 'death'; isEstimated: boolean }

defineProps<{
  sortedDeaths: DeathRecord[]
  selectedDeathIndex: number | null
  selectedDeath: DeathRecord | null
  selectedDeathWindow: DeathWindow | null
  deathHitLog: DeathEvent[]
  deathInspectorTab: DeathInspectorTab
  deathInspectorTabs: readonly (readonly [DeathInspectorTab, string])[]
  selectedDeathRecapRows: DeathInspectorRow[]
  selectedDeathWindowCasts: CastEvent[]
  selectedDeathRelatedDamage: DeathRelatedDamageRow[]
  selectedAbility: string
  f: (value: number) => string
  fmtTime: (ms: number) => string
  nameStyle: NameStyleFn
  deathHpBars: (death: DeathRecord) => DeathHpBar[]
  formatHpBefore: (event: DeathEvent) => string
  abilityIdForName: (abilityName: string) => string
  abilityIconSrc: (abilityId: string, abilityName: string) => string
}>()

const emit = defineEmits<{
  selectDeath: [index: number, death: DeathRecord]
  selectAbility: [name: string]
  clearAbilityIcon: [abilityId: string, abilityName: string]
  updateDeathInspectorTab: [tab: DeathInspectorTab]
}>()
</script>

<template>
  <div v-if="sortedDeaths.length === 0" class="bp-waiting">No deaths recorded this pull.</div>
  <div v-else class="bp-workspace">
    <aside class="bp-rail bp-rail--deaths">
      <div class="bp-rail-title">Deaths</div>
      <div v-for="(death, i) in sortedDeaths" :key="i" class="dl-death-row" :class="{ active: selectedDeathIndex === i }" @click="emit('selectDeath', i, death)">
        <div class="dl-death-info"><span class="dl-death-name" :style="nameStyle(death?.targetName ?? '')">{{ death?.targetName ?? 'Unknown' }}</span><span class="dl-death-time">{{ fmtTime(death?.timestamp ?? 0) }}</span></div>
        <div class="dl-spark">
          <svg viewBox="0 0 120 28" preserveAspectRatio="none" width="120" height="28" class="bp-spark-svg">
            <line x1="0" y1="28" x2="120" y2="28" stroke="rgba(255,255,255,0.07)" stroke-width="1" />
            <line x1="0" y1="14" x2="120" y2="14" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
            <template v-for="(bar, bi) in deathHpBars(death)" :key="'b-' + bi">
              <rect :x="bar.x" :y="28 - (bar.hpBefore * 28)" :width="bar.width - 1" :height="bar.hpBefore * 28" :fill="bar.hpBefore > 0.5 ? 'rgba(5,136,55,0.5)' : (bar.hpBefore > 0.25 ? 'rgba(180,150,50,0.5)' : 'rgba(180,50,50,0.5)')" opacity="0.7" />
              <rect v-if="bar.type === 'heal' || bar.type === 'dmg'" :x="bar.x" :y="bar.type === 'heal' ? (28 - (bar.hpAfter * 28)) : (28 - (bar.hpBefore * 28))" :width="bar.width - 1" :height="Math.abs((bar.hpAfter - bar.hpBefore) * 28)" :fill="bar.type === 'heal' ? '#ffffff' : '#000000'" opacity="0.35" />
              <rect v-if="bar.type === 'death'" :x="bar.x" y="0" :width="Math.max(1, bar.width - 1)" height="28" fill="rgba(255,0,0,0.18)" />
            </template>
            <line x1="120" y1="0" x2="120" y2="28" stroke="#ff0000" stroke-width="2" />
            <text x="115" y="8" fill="#ff0000" font-size="6">X</text>
          </svg>
          <span v-if="!deathHpBars(death).length" class="bp-spark-none">no HP data</span>
        </div>
      </div>
    </aside>

    <main class="bp-main">
      <div v-if="!selectedDeath" class="dl-detail-empty">Select a death to review</div>
      <template v-else>
        <div class="dl-detail-header">
          <span class="dl-detail-name" :style="nameStyle(selectedDeath.targetName)">{{ selectedDeath.targetName }}</span>
          <span class="dl-detail-time">died @ {{ fmtTime(selectedDeath?.timestamp ?? 0) }}</span>
          <span class="dl-detail-sub">window {{ selectedDeathWindow ? `${fmtTime(selectedDeathWindow.start)} → ${fmtTime(selectedDeathWindow.end)}` : '—' }}</span>
        </div>
        <div v-if="deathHitLog.length === 0" class="dl-detail-empty">No hit data recorded.</div>
        <div v-else class="dl-hit-scroll">
          <table class="dl-hit-table">
            <thead><tr><th class="dl-col-time">Time</th><th class="dl-col-type"></th><th class="dl-col-ability">Ability</th><th class="dl-col-source">Source</th><th class="dl-col-hpbefore">HP Before</th><th class="dl-col-hpbar">Trend</th><th class="dl-col-amount">Amount</th></tr></thead>
            <tbody>
              <tr v-for="(hit, hi) in deathHitLog" :key="hi" :class="[hit.type === 'heal' ? 'dl-row-heal' : 'dl-row-dmg', hit.isDeathBlow ? 'dl-row-death' : '', selectedAbility === hit.abilityName ? 'bp-row-active' : '']" @click="emit('selectAbility', hit.abilityName)">
                <td class="dl-col-time">{{ fmtTime(hit?.t ?? 0) }}</td>
                <td class="dl-col-type"><span v-if="hit.isDeathBlow" class="dl-badge-death">X</span><span v-else :class="hit.type === 'heal' ? 'dl-badge-heal' : 'dl-badge-dmg'">{{ hit.type === 'heal' ? 'H' : 'D' }}</span></td>
                <td class="dl-col-ability"><AbilityCell :ability-id="abilityIdForName(hit.abilityName)" :ability-name="hit.abilityName" :icon-src="abilityIconSrc(abilityIdForName(hit.abilityName), hit.abilityName)" small @icon-error="emit('clearAbilityIcon', abilityIdForName(hit.abilityName), hit.abilityName)" /></td>
                <td class="dl-col-source">{{ hit.sourceName }}</td>
                <td class="dl-col-hpbefore"><span>{{ formatHpBefore(hit) }}</span><span v-if="hit.isEstimated" class="dl-hp-estimate">est.</span></td>
                <td class="dl-col-hpbar"><div class="dl-hpbar-container"><div class="dl-hpbar-bg" :style="`width: ${hit.hpBefore * 100}%`"></div><div v-if="Math.abs(hit.hpAfter - hit.hpBefore) > 0.001" class="dl-hpbar-change" :class="hit.type === 'heal' ? 'dl-hpbar-heal' : 'dl-hpbar-dmg'" :style="hit.type === 'heal' ? `left: ${hit.hpBefore * 100}%; width: ${(hit.hpAfter - hit.hpBefore) * 100}%` : `left: ${hit.hpAfter * 100}%; width: ${(hit.hpBefore - hit.hpAfter) * 100}%`"></div></div></td>
                <td class="dl-col-amount" :class="hit.type === 'heal' ? 'dl-amount-heal-bold' : (hit.isDeathBlow ? 'dl-amount-death' : 'dl-amount-dmg-bold')">{{ hit.isDeathBlow ? 'KO' : (hit.type === 'heal' ? '+' : '-') + f(hit.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </main>

    <aside class="bp-inspector">
      <div class="bp-inspector-title">Death Inspector</div>
      <div class="bp-toolbar-group bp-toolbar-group--full">
        <button v-for="[value, label] in deathInspectorTabs" :key="value" class="bp-mode-btn" :class="{ active: deathInspectorTab === value }" @click="emit('updateDeathInspectorTab', value)">{{ label }}</button>
      </div>
      <div v-if="!selectedDeath" class="bp-empty-panel">Pick a death to inspect it.</div>
      <template v-else-if="deathInspectorTab === 'recap'">
        <div class="bp-inspector-block"><div class="bp-kv"><span>Target</span><strong :style="nameStyle(selectedDeath.targetName)">{{ selectedDeath.targetName }}</strong></div></div>
        <InspectorRows :rows="selectedDeathRecapRows" />
      </template>
      <InspectorList
        v-else-if="deathInspectorTab === 'context'"
        heading="Nearby casts"
        empty-text="No casts for this player inside the selected death window."
        :rows="selectedDeathWindowCasts.slice(0, 8).map(cast => ({ key: `death-cast-${cast.t}-${cast.abilityName}`, title: cast.abilityName, detail: fmtTime(cast.t) }))"
      />
      <InspectorList
        v-else
        heading="Related damage"
        empty-text="No incoming damage rows were captured in this recap."
        :rows="selectedDeathRelatedDamage.map(row => ({ key: row.ability, title: row.ability, detail: f(row.amount) }))"
      />
    </aside>
  </div>
</template>
