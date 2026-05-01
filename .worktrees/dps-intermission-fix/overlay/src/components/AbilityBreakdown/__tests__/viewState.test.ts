import { describe, expect, it } from 'vitest'
import { useBreakdownViewState } from '../viewState'

describe('useBreakdownViewState', () => {
  it('initializes the breakdown view defaults', () => {
    const state = useBreakdownViewState()

    expect(state.activeView.value).toBe('overview')
    expect(state.chartMetric.value).toBe('dps')
    expect(state.eventActorScope.value).toBe('selected')
    expect([...state.eventFilters.value].sort()).toEqual(['casts', 'damage', 'deaths', 'healing', 'raises'])
    expect([...state.timelineOverlays.value].sort()).toEqual(['buffs', 'deaths', 'raises', 'spikes'])
    expect([...state.castFilters.value].sort()).toEqual(['cooldowns', 'dps', 'heals', 'mitigations'])
    expect(state.viewTabs.map(tab => tab.id)).toEqual([
      'overview',
      'pulls',
      'done',
      'taken',
      'timeline',
      'deaths',
      'casts',
      'events',
    ])
  })

  it('toggles filter sets immutably', () => {
    const state = useBreakdownViewState()
    const eventFilters = state.eventFilters.value
    const timelineOverlays = state.timelineOverlays.value
    const castFilters = state.castFilters.value

    state.toggleEventFilter('damage')
    state.toggleTimelineOverlay('buffs')
    state.toggleCastFilter('dps')

    expect(state.eventFilters.value).not.toBe(eventFilters)
    expect(state.timelineOverlays.value).not.toBe(timelineOverlays)
    expect(state.castFilters.value).not.toBe(castFilters)
    expect(state.eventFilters.value.has('damage')).toBe(false)
    expect(state.timelineOverlays.value.has('buffs')).toBe(false)
    expect(state.castFilters.value.has('dps')).toBe(false)

    state.toggleEventFilter('damage')
    state.toggleTimelineOverlay('buffs')
    state.toggleCastFilter('dps')

    expect(state.eventFilters.value.has('damage')).toBe(true)
    expect(state.timelineOverlays.value.has('buffs')).toBe(true)
    expect(state.castFilters.value.has('dps')).toBe(true)
  })

  it('opens the timeline view focused at a bucket', () => {
    const state = useBreakdownViewState()

    state.openTimelineAtBucket(7)

    expect(state.activeView.value).toBe('timeline')
    expect(state.timelineFocusBucket.value).toBe(7)
  })
})
