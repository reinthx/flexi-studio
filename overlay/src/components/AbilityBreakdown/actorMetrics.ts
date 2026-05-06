import { computed, type ComputedRef, type Ref } from 'vue'
import type { CastEvent, CombatantAbilityData, DeathRecord, DpsTimeline } from '@shared/configSchema'
import type { BreakdownView } from './types'
import { totalAbilityDamage } from './abilityRows'

type NumberRecord = Record<string, number>

type ActorMetricsOptions = {
  allData: Ref<Record<string, CombatantAbilityData>>
  selfName: Ref<string>
  visibleCombatants: ComputedRef<string[]>
  damageByCombatant: Ref<NumberRecord>
  dpsByCombatant: Ref<NumberRecord>
  rdpsByCombatant: Ref<NumberRecord>
  rdpsGiven: Ref<NumberRecord>
  rdpsTaken: Ref<NumberRecord>
  encounterDurationSec: Ref<number>
  damageTakenData: Ref<Record<string, CombatantAbilityData>>
  healingReceivedData: Ref<Record<string, CombatantAbilityData>>
  takenMode: Ref<'damage' | 'healing'>
  sortedDeaths: ComputedRef<DeathRecord[]>
  castData: Ref<Record<string, CastEvent[]>>
  activeView: Ref<BreakdownView>
  chartMetric: Ref<'dps' | 'rdps' | 'hps' | 'dtps'>
  activeTimeline: ComputedRef<DpsTimeline>
  metricLabel: ComputedRef<string>
  format: (value: number) => string
  isEnemy: (name: string) => boolean
}

export function useActorMetrics(options: ActorMetricsOptions) {
  const {
    allData,
    selfName,
    visibleCombatants,
    damageByCombatant,
    dpsByCombatant,
    rdpsByCombatant,
    rdpsGiven,
    rdpsTaken,
    encounterDurationSec,
    damageTakenData,
    healingReceivedData,
    takenMode,
    sortedDeaths,
    castData,
    activeView,
    chartMetric,
    activeTimeline,
    metricLabel,
    format,
    isEnemy,
  } = options

  const totalOutgoingFor = (name: string) => totalAbilityDamage(allData.value[name] ?? {})

  function actorAliases(name: string): string[] {
    const aliases = [name]
    if (name === 'YOU' && selfName.value) aliases.push(selfName.value)
    if (selfName.value && name === selfName.value) aliases.push('YOU')
    return [...new Set(aliases.filter(Boolean))]
  }

  function metricFor(record: NumberRecord, name: string): number | undefined {
    for (const alias of actorAliases(name)) {
      const value = record[alias]
      if (value !== undefined) return value
    }
    return undefined
  }

  function displayActorName(name: string): string {
    return name === 'YOU' && selfName.value ? selfName.value : name
  }

  function rowActorNames(): string[] {
    const names = new Set<string>()
    for (const name of visibleCombatants.value) {
      if (!isEnemy(name)) names.add(displayActorName(name))
    }
    for (const source of [damageByCombatant.value, dpsByCombatant.value, rdpsByCombatant.value]) {
      for (const name of Object.keys(source)) {
        const displayName = displayActorName(name)
        if (!isEnemy(displayName)) names.add(displayName)
      }
    }
    return Array.from(names)
  }

  const fallbackRateFor = (name: string) => totalOutgoingFor(name) / Math.max(encounterDurationSec.value, 1)
  const attributionDamageFor = (name: string) => metricFor(damageByCombatant.value, name) ?? totalOutgoingFor(name)
  const dpsFor = (name: string) => metricFor(dpsByCombatant.value, name) ?? fallbackRateFor(name)
  const rdpsFor = (name: string) => metricFor(rdpsByCombatant.value, name) ?? fallbackRateFor(name)
  const rdpsGivenFor = (name: string) => metricFor(rdpsGiven.value, name) ?? 0
  const rdpsTakenFor = (name: string) => metricFor(rdpsTaken.value, name) ?? 0

  function rdpsDeltaLabel(name: string): string {
    const given = rdpsGivenFor(name)
    const taken = rdpsTakenFor(name)
    if (given === 0 && taken === 0) return 'no buff adj.'
    return `+${format(given)} given / -${format(taken)} taken`
  }

  const totalTakenFor = (name: string) => totalAbilityDamage(damageTakenData.value[name] ?? {})
  const totalHealingReceivedFor = (name: string) => totalAbilityDamage(healingReceivedData.value[name] ?? {})
  const totalIncomingFor = (name: string) => takenMode.value === 'healing' ? totalHealingReceivedFor(name) : totalTakenFor(name)
  const deathCountFor = (name: string) => sortedDeaths.value.filter(death => death.targetName === name).length
  const castCountFor = (name: string) => (castData.value[name] ?? []).length

  function selectorValueFor(name: string): number {
    if (activeView.value === 'taken') return totalIncomingFor(name)
    if (activeView.value === 'deaths') return deathCountFor(name)
    if (activeView.value === 'casts') return castCountFor(name)
    if (activeView.value === 'timeline') {
      if (chartMetric.value === 'rdps') return rdpsFor(name)
      const buckets = activeTimeline.value[name] ?? []
      return buckets.reduce((sum, value) => sum + value, 0)
    }
    return totalOutgoingFor(name)
  }

  function selectorBadgeFor(name: string): string {
    if (activeView.value === 'deaths') return `${deathCountFor(name)} deaths`
    if (activeView.value === 'casts') return `${castCountFor(name)} casts`
    if (activeView.value === 'timeline' && chartMetric.value === 'rdps') return `${format(rdpsFor(name))} rDPS`
    if (activeView.value === 'timeline') return metricLabel.value
    if (activeView.value === 'taken') return `${format(totalIncomingFor(name))} in`
    return `${format(totalOutgoingFor(name))} out`
  }

  const takenSelectorBadgeFor = (name: string) => format(totalIncomingFor(name))
  const castSelectorBadgeFor = (name: string) => `${castCountFor(name)} casts`

  const selectorMax = computed(() =>
    Math.max(1, ...visibleCombatants.value.map(name => selectorValueFor(name)))
  )

  function selectorFillWidth(name: string): string {
    return `${((selectorValueFor(name) / selectorMax.value) * 100).toFixed(1)}%`
  }

  return {
    rowActorNames,
    attributionDamageFor,
    dpsFor,
    rdpsFor,
    rdpsGivenFor,
    rdpsTakenFor,
    rdpsDeltaLabel,
    deathCountFor,
    selectorBadgeFor,
    takenSelectorBadgeFor,
    castSelectorBadgeFor,
    selectorFillWidth,
  }
}
