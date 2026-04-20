import { ref } from 'vue'
import type { BreakdownView, CastFilter, EventActorScope, EventFilter, TimelineOverlay } from './types'

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
    const next = new Set(timelineOverlays.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    timelineOverlays.value = next
  }

  function toggleEventFilter(name: EventFilter): void {
    const next = new Set(eventFilters.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    eventFilters.value = next
  }

  function toggleCastFilter(name: CastFilter): void {
    const next = new Set(castFilters.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    castFilters.value = next
  }

  function openTimelineAtBucket(bucket: number): void {
    timelineFocusBucket.value = bucket
    activeView.value = 'timeline'
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
    toggleTimelineOverlay,
    toggleEventFilter,
    toggleCastFilter,
    openTimelineAtBucket,
  }
}
