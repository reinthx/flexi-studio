<script setup lang="ts">
import { computed } from 'vue'
import { useLiveDataStore } from '../stores/liveData'
import { formatValue } from '@shared/formatValue'

const props = defineProps<{
  combatantName: string
}>()

const emit = defineEmits<{ close: [] }>()

const store = useLiveDataStore()

// LogLine data is keyed by real name. CombatData uses "YOU" for the local player — resolve it.
const resolvedName = computed(() =>
  props.combatantName === 'YOU' ? store.selfName : props.combatantName
)

const rawData = computed(() => store.currentAbilityData[resolvedName.value] ?? {})

const playerTotal = computed(() =>
  Object.values(rawData.value).reduce((s, a) => s + a.totalDamage, 0)
)

const abilities = computed(() =>
  Object.values(rawData.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    playerTotal.value > 0 ? ((a.totalDamage / playerTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

const fmt = computed(() => store.profile.global.valueFormat ?? 'abbreviated')
const f = (n: number) => formatValue(n, fmt.value)

const displayName = computed(() =>
  props.combatantName === 'YOU'
    ? `${store.selfName} (YOU)`
    : props.combatantName
)

const hasData = computed(() => abilities.value.length > 0)
</script>

<template>
  <div class="ab-panel">
    <div class="ab-header">
      <span class="ab-title">{{ displayName }}</span>
      <span class="ab-total">{{ f(playerTotal) }} tracked dmg</span>
      <button class="ab-close" @click="emit('close')">✕</button>
    </div>

    <div v-if="!hasData" class="ab-empty">No ability data yet for this pull.</div>

    <div v-else class="ab-scroll">
      <table class="ab-table">
        <thead>
          <tr>
            <th class="col-name">Ability</th>
            <th class="col-num">Damage</th>
            <th class="col-num">%</th>
            <th class="col-num">Casts</th>
            <th class="col-num">Avg</th>
            <th class="col-num">Max</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in abilities" :key="row.abilityId">
            <!-- fill bar behind the row driven by % -->
            <td class="col-name">
              <div class="row-fill" :style="{ width: row.pct + '%' }" />
              <span class="ability-name">{{ row.abilityName }}</span>
            </td>
            <td class="col-num">{{ f(row.totalDamage) }}</td>
            <td class="col-num col-pct">{{ row.pct }}%</td>
            <td class="col-num">{{ row.hits }}</td>
            <td class="col-num">{{ f(row.avg) }}</td>
            <td class="col-num">{{ f(row.maxHit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ab-panel {
  position: fixed;
  top: 8px;
  right: 8px;
  width: 420px;
  max-height: 80vh;
  background: rgba(10, 10, 14, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  box-shadow: 0 4px 24px rgba(0,0,0,0.7);
  font-family: 'Segoe UI', monospace, sans-serif;
  font-size: 12px;
  color: rgba(255,255,255,0.85);
  overflow: hidden;
  pointer-events: auto;
}

.ab-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.ab-title {
  font-weight: 600;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.ab-total {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  white-space: nowrap;
}
.ab-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}
.ab-close:hover { color: #fff; }

.ab-empty {
  padding: 20px;
  text-align: center;
  color: rgba(255,255,255,0.3);
  font-size: 11px;
}

.ab-scroll {
  overflow-y: auto;
  flex: 1;
}

.ab-table {
  width: 100%;
  border-collapse: collapse;
}
.ab-table thead tr {
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.ab-table th {
  padding: 4px 8px;
  text-align: right;
  font-size: 10px;
  font-weight: 500;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.ab-table th.col-name { text-align: left; }

.ab-table tbody tr {
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.ab-table tbody tr:hover { background: rgba(255,255,255,0.04); }

td {
  padding: 3px 8px;
  text-align: right;
  white-space: nowrap;
}
td.col-name {
  text-align: left;
  position: relative;
  max-width: 160px;
  overflow: hidden;
}

/* Fill bar that sits behind the ability name */
.row-fill {
  position: absolute;
  inset: 0;
  right: auto;
  background: rgba(255,255,255,0.05);
  pointer-events: none;
  min-width: 2px;
}
.ability-name {
  position: relative;
  z-index: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  white-space: nowrap;
}

.col-pct { color: rgba(255, 210, 80, 0.9); }

.col-num {
  font-variant-numeric: tabular-nums;
  color: rgba(255,255,255,0.7);
}
</style>
