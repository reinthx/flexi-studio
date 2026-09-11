import { ref } from 'vue'
import type { BreakdownView, CastFilter, EventActorScope, EventFilter, TimelineOverlay } from './types'

/**
 * Copy-toggle a set member. Always returns a new Set so Vue refs update —
 * mutating a Set in place does not trigger reactivity.
 */
export function toggleSetMember<T>(set: Set<T>, member: T): Set<T> {
  const next = new Set(set)
  if (next.has(member)) next.delete(member)
  else next.add(member)
  return next
}

/**
 * Series to auto-hide on a fresh pull: timeline names outside the party that
 * are not enemies. Pure core of the popout's applyAutoHide.
 */
export function computeAutoHiddenSeries(
  timelineNames: string[],
  partyNames: string[],
  selfName: string,
  isEnemy: (name: string) => boolean,
): Set<string> {
  const party = new Set([...partyNames, selfName, 'YOU'])
  const toHide = new Set<string>()
  for (const name of timelineNames) {
    if (!party.has(name) && !isEnemy(name)) toHide.add(name)
  }
  return toHide
}

/** Stable key for tracking the selected death across data refreshes. */
export function deathSelectionKey(
  death: { targetId: string; targetName: string; timestamp: number } | null | undefined,
): string {
  return death ? `${death.targetId}|${death.targetName}|${death.timestamp}` : ''
}

/**
 * Horizontal scroll delta for wheel-over-timeline. Returns 0 when there is
 * nothing to scroll, preferring the dominant axis.
 */
export function wheelScrollDelta(
  scrollWidth: number,
  clientWidth: number,
  deltaX: number,
  deltaY: number,
): number {
  if (scrollWidth - clientWidth <= 0) return 0
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
  return delta || 0
}

export function useBreakdownViewState() {
  const activeView = ref<BreakdownView>('overview')
  const chartMetric = ref<'dps' | 'rdps' | 'hps' | 'dtps'>('dps')
  const selectedAbility = ref('')
  const doneDimension = ref<'ability' | 'targets' | 'sources'>('ability')
  const takenMode = ref<'damage' | 'healing'>('damage')
  const deathInspectorTab = ref<'recap' | 'context' | 'related'>('recap')
  const eventWindowOnly = ref(false)
  const eventActorScope = ref<EventActorScope>('selected')
  const eventFilters = ref<Set<EventFilter>>(new Set(['damage', 'healing', 'casts', 'deaths', 'raises']))
  const timelineOverlays = ref<Set<TimelineOverlay>>(new Set(['buffs', 'deaths', 'raises', 'spikes']))
  const timelineFocusBucket = ref<number | null>(null)
  const castFilters = ref<Set<CastFilter>>(new Set(['cooldowns', 'mitigations', 'dps', 'heals']))

  const doneSortColumn = ref<'totalDamage' | 'dps' | 'hits' | 'maxHit' | 'critPct' | 'abilityName'>('totalDamage')
  const doneSortDesc = ref(true)
  const takenSortColumn = ref<'totalDamage' | 'hits' | 'maxHit' | 'abilityName'>('totalDamage')
  const takenSortDesc = ref(true)

  const viewTabs: Array<{ id: BreakdownView; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'pulls', label: 'Pulls' },
    { id: 'done', label: 'Done' },
    { id: 'taken', label: 'Taken' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'deaths', label: 'Deaths' },
    { id: 'casts', label: 'Casts' },
    { id: 'events', label: 'Events' },
  ]

  function toggleTimelineOverlay(name: TimelineOverlay): void {
    timelineOverlays.value = toggleSetMember(timelineOverlays.value, name)
  }

  function toggleEventFilter(name: EventFilter): void {
    eventFilters.value = toggleSetMember(eventFilters.value, name)
  }

  function toggleCastFilter(name: CastFilter): void {
    castFilters.value = toggleSetMember(castFilters.value, name)
  }

  function openTimelineAtBucket(bucket: number): void {
    timelineFocusBucket.value = bucket
    activeView.value = 'timeline'
  }

  function sortDoneBy(column: typeof doneSortColumn.value): void {
    if (doneSortColumn.value === column) {
      doneSortDesc.value = !doneSortDesc.value
    } else {
      doneSortColumn.value = column
      doneSortDesc.value = true
    }
  }

  function sortTakenBy(column: typeof takenSortColumn.value): void {
    if (takenSortColumn.value === column) {
      takenSortDesc.value = !takenSortDesc.value
    } else {
      takenSortColumn.value = column
      takenSortDesc.value = true
    }
  }

  return {
    activeView,
    chartMetric,
    selectedAbility,
    doneDimension,
    takenMode,
    deathInspectorTab,
    eventWindowOnly,
    eventActorScope,
    eventFilters,
    timelineOverlays,
    timelineFocusBucket,
    castFilters,
    viewTabs,
    doneSortColumn,
    doneSortDesc,
    takenSortColumn,
    takenSortDesc,
    toggleTimelineOverlay,
    toggleEventFilter,
    toggleCastFilter,
    openTimelineAtBucket,
    sortDoneBy,
    sortTakenBy,
  }
}
