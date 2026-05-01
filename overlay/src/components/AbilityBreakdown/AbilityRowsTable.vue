<script setup lang="ts">
import { computed } from 'vue'
import AbilityCell from './AbilityCell.vue'
import type { AbilityBreakdownRow, AbilitySortColumn, TakenSortColumn } from './abilityRows'
import { rawHealingAverage } from './formatters'

const props = withDefaults(defineProps<{
  rows: AbilityBreakdownRow[]
  mode: 'done' | 'taken'
  format: (value: number) => string
  iconSrc: (abilityId: string, abilityName: string) => string
  selectedAbilityName?: string; sortColumn?: AbilitySortColumn | TakenSortColumn; sortDesc?: boolean
  takenMode?: 'damage' | 'healing'; encounterDurationSec?: number; limit?: number; compact?: boolean
  panelTitle?: string; fillClass?: string; nearDeathCounts?: Map<string, number>
}>(), {
  selectedAbilityName: '', sortColumn: undefined, sortDesc: true, takenMode: 'damage',
  encounterDurationSec: 0, limit: 0, compact: false, panelTitle: '', fillClass: '',
  nearDeathCounts: () => new Map(),
})

const emit = defineEmits<{
  select: [abilityName: string]; sort: [column: AbilitySortColumn | TakenSortColumn]; iconError: [abilityId: string, abilityName: string]
}>()

const visibleRows = computed(() => props.limit > 0 ? props.rows.slice(0, props.limit) : props.rows)
const isTaken = computed(() => props.mode === 'taken')
const isHealing = computed(() => isTaken.value && props.takenMode === 'healing')

function sortSuffix(column: AbilitySortColumn | TakenSortColumn): string { return props.sortColumn === column ? (props.sortDesc ? ' ↓' : ' ↑') : '' }
</script>

<template>
  <section v-if="panelTitle" class="bp-panel">
    <div class="bp-panel-title">{{ panelTitle }}</div>
    <AbilityRowsTable v-bind="$props" panel-title="" @select="emit('select', $event)" @sort="emit('sort', $event)" @icon-error="(id, name) => emit('iconError', id, name)" />
  </section>
  <table v-else class="bp-table">
    <thead><tr>
      <th class="col-name" @click="emit('sort', 'abilityName')">{{ isTaken ? 'Source Ability' : 'Ability' }}</th>
      <th class="col-num col-sort" :class="{ active: sortColumn === 'totalDamage' }" @click="emit('sort', 'totalDamage')">{{ isHealing ? 'Effective' : 'Total' }}{{ sortSuffix('totalDamage') }}</th>
      <th v-if="isHealing" class="col-num">Overheal</th>
      <th class="col-pct">%</th>
      <template v-if="compact"><th class="col-num">{{ isTaken ? 'Near Deaths' : 'Rate' }}</th></template>
      <template v-else-if="isTaken">
        <th class="col-num col-sort" :class="{ active: sortColumn === 'hits' }" @click="emit('sort', 'hits')">{{ isHealing ? 'Heals' : 'Hits' }}{{ sortSuffix('hits') }}</th><th class="col-num">Avg</th><th class="col-num col-sort" :class="{ active: sortColumn === 'maxHit' }" @click="emit('sort', 'maxHit')">Max{{ sortSuffix('maxHit') }}</th><th class="col-num">Near Deaths</th>
      </template>
      <template v-else>
        <th class="col-num col-sort" :class="{ active: sortColumn === 'dps' }" @click="emit('sort', 'dps')">DPS{{ sortSuffix('dps') }}</th><th class="col-num col-sort" :class="{ active: sortColumn === 'hits' }" @click="emit('sort', 'hits')">Casts{{ sortSuffix('hits') }}</th><th class="col-num col-sort" :class="{ active: sortColumn === 'maxHit' }" @click="emit('sort', 'maxHit')">Max{{ sortSuffix('maxHit') }}</th>
      </template>
    </tr></thead>
    <tbody>
      <tr v-for="row in visibleRows" :key="`${mode}-${takenMode}-${row.abilityId}`" :class="{ 'bp-row-active': selectedAbilityName === row.abilityName }" @click="emit('select', row.abilityName)">
        <td class="col-name"><div class="row-fill" :class="fillClass" :style="{ width: row.pct + '%' }" /><span class="aname"><AbilityCell :ability-id="row.abilityId" :ability-name="row.abilityName" :icon-src="iconSrc(row.abilityId, row.abilityName)" @icon-error="emit('iconError', row.abilityId, row.abilityName)" /></span></td>
        <td class="col-num">{{ format(row.totalDamage) }}</td><td v-if="isHealing" class="col-num">{{ (row.overheal ?? 0) > 0 ? format(row.overheal ?? 0) : '—' }}</td><td class="col-pct">{{ row.pct }}%</td>
        <template v-if="compact"><td class="col-num">{{ isTaken ? (nearDeathCounts.get(row.abilityName) ?? '—') : (encounterDurationSec > 0 ? format(row.dps) : '—') }}</td></template>
        <template v-else-if="isTaken">
          <td class="col-num">{{ row.hits }}</td><td class="col-num">{{ format(isHealing ? rawHealingAverage(row) : row.avg) }}</td><td class="col-num">{{ format(row.maxHit) }}</td><td class="col-num">{{ nearDeathCounts.get(row.abilityName) ?? '—' }}</td>
        </template>
        <template v-else>
          <td class="col-num">{{ encounterDurationSec > 0 ? format(row.dps) : '—' }}</td><td class="col-num">{{ row.hits }}</td><td class="col-num">{{ format(row.maxHit) }}</td>
        </template>
      </tr>
    </tbody>
  </table>
</template>
