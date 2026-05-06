import { computed, type ComputedRef, type Ref } from 'vue'
import type { CastEvent, DeathRecord } from '@shared/configSchema'
import type { BreakdownEventRow, EventActorScope, EventFilter } from './types'
import { deathEventsFor, formatHpBefore, formatHpValue } from './deathTransforms'

export type EventInspectorRow = [string, string]

interface EventRowSources {
  eventActorScope: Ref<EventActorScope>
  visibleCombatants: ComputedRef<string[]>
  resolvedSelected: ComputedRef<string>
  castData: Ref<Record<string, CastEvent[]>>
  sortedDeaths: ComputedRef<DeathRecord[]>
  eventFilters: Ref<Set<EventFilter>>
  eventWindowOnly: Ref<boolean>
  selectedDeathWindow: ComputedRef<{ start: number; end: number } | null>
  format: (value: number) => string
}

export function useEventRows(sources: EventRowSources) {
  function eventRowCountFor(name: string): number {
    return (sources.castData.value[name] ?? []).length +
      sources.sortedDeaths.value
        .filter(death => death.targetName === name)
        .reduce((sum, death) => sum + deathEventsFor(death).length + (death.resurrectTime ? 1 : 0), 0)
  }

  const eventRowsRaw = computed<BreakdownEventRow[]>(() => {
    const actors = sources.eventActorScope.value === 'all'
      ? sources.visibleCombatants.value.filter(name => eventRowCountFor(name) > 0)
      : [sources.resolvedSelected.value].filter(Boolean)
    const rows: BreakdownEventRow[] = []

    for (const actor of actors) {
      for (const cast of sources.castData.value[actor] ?? []) {
        rows.push({
          key: `cast-${actor}-${cast.t}-${cast.abilityName}-${cast.target ?? ''}`,
          t: cast.t,
          actor,
          eventType: 'casts',
          ability: cast.abilityName,
          source: actor,
          target: cast.target ?? '',
          amount: null,
          hpBefore: '—',
          hpAfter: '—',
          note: cast.type === 'tick' ? 'tick' : 'cast',
        })
      }

      for (const death of sources.sortedDeaths.value.filter(death => death.targetName === actor)) {
        for (const event of deathEventsFor(death)) {
          rows.push({
            key: `death-event-${actor}-${death.timestamp}-${event.t}-${event.abilityName}-${event.type}`,
            t: event.t,
            actor,
            eventType: event.isDeathBlow ? 'deaths' : event.type === 'heal' ? 'healing' : 'damage',
            ability: event.isDeathBlow ? 'KO' : event.abilityName,
            source: event.sourceName,
            target: actor,
            amount: event.isDeathBlow ? null : event.amount,
            hpBefore: formatHpBefore(event, sources.format),
            hpAfter: `${formatHpValue(event.hpAfterRaw, sources.format)} / ${formatHpValue(event.maxHp, sources.format)} (${Math.round(event.hpAfter * 100)}%)`,
            note: event.isEstimated ? 'estimated death recap' : 'death recap',
          })
        }

        if (death.resurrectTime) {
          rows.push({
            key: `raise-${death.resurrectTime}-${actor}`,
            t: death.resurrectTime,
            actor,
            eventType: 'raises',
            ability: 'Raise',
            source: '',
            target: actor,
            amount: null,
            hpBefore: '0%',
            hpAfter: 'raised',
            note: 'resurrection detected',
          })
        }
      }
    }

    return rows.sort((a, b) => b.t - a.t)
  })

  const eventRows = computed(() => {
    const filtered = eventRowsRaw.value.filter(row => sources.eventFilters.value.has(row.eventType))
    if (!sources.eventWindowOnly.value || !sources.selectedDeathWindow.value) return filtered
    return filtered.filter(row => row.t >= sources.selectedDeathWindow.value!.start && row.t <= sources.selectedDeathWindow.value!.end)
  })

  return { eventRowCountFor, eventRowsRaw, eventRows }
}

export function buildActiveFilterChips(options: {
  pullStatusLabel: string
  selectedPlayer: string
  metricLabel: string
  showEnemies: boolean
  showFriendlyNPCs: boolean
  selectedAbility: string
  eventWindowOnly: boolean
  selectedDeathIndex: number | null
  hasSelectedDeathWindow: boolean
}): string[] {
  const chips = [`Pull=${options.pullStatusLabel}`, `Player=${options.selectedPlayer || 'None'}`, `Metric=${options.metricLabel}`]
  if (options.showEnemies) chips.push('Show Enemies')
  if (options.showFriendlyNPCs) chips.push('Show NPCs')
  if (options.selectedAbility) chips.push(`Ability=${options.selectedAbility}`)
  if (options.eventWindowOnly && options.hasSelectedDeathWindow) chips.push(`Window=Death #${(options.selectedDeathIndex ?? 0) + 1}`)
  return chips
}

export function buildEventInspectorRows(options: {
  rowCount: number
  actorScope: EventActorScope
  selectedAbility: string
  eventWindowOnly: boolean
  hasSelectedDeathWindow: boolean
}): EventInspectorRow[] {
  return [
    ['Rows', String(options.rowCount)],
    ['Actor Scope', options.actorScope === 'all' ? 'All actors' : 'Selected actor'],
    ['Selected Ability', options.selectedAbility || 'None'],
    ['Window', options.eventWindowOnly && options.hasSelectedDeathWindow ? 'Selected death' : 'Whole pull'],
  ]
}
