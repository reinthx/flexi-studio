import { describe, expect, it } from 'vitest'
import {
  computeAutoHiddenSeries,
  deathSelectionKey,
  toggleSetMember,
  useBreakdownViewState,
  wheelScrollDelta,
} from '../viewState'

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

  it('toggles set members with a fresh set', () => {
    const original = new Set(['a'])
    const removed = toggleSetMember(original, 'a')
    expect(removed.has('a')).toBe(false)
    expect(original.has('a')).toBe(true)
    expect(removed).not.toBe(original)

    const added = toggleSetMember(original, 'b')
    expect(added.has('b')).toBe(true)
    expect(original.has('b')).toBe(false)
  })

  it('hides non-party non-enemy timeline series', () => {
    const isEnemy = (name: string) => name === 'Boss'
    expect([...computeAutoHiddenSeries(['Alice', 'Bob', 'Boss', 'Pet (Alice)'], ['Alice'], 'YOU', isEnemy)]).toEqual([
      'Bob',
      'Pet (Alice)',
    ])
    expect([...computeAutoHiddenSeries(['Alice', 'Boss'], ['Alice'], 'YOU', isEnemy)]).toEqual([])
  })

  it('keys deaths stably and blanks missing ones', () => {
    expect(deathSelectionKey({ targetId: '10', targetName: 'Bob', timestamp: 5 })).toBe('10|Bob|5')
    expect(deathSelectionKey(null)).toBe('')
    expect(deathSelectionKey(undefined)).toBe('')
  })

  it('resolves wheel deltas to the dominant scrollable axis', () => {
    expect(wheelScrollDelta(100, 100, 5, 5)).toBe(0)
    expect(wheelScrollDelta(200, 100, 0, 0)).toBe(0)
    expect(wheelScrollDelta(200, 100, 8, 3)).toBe(8)
    expect(wheelScrollDelta(200, 100, 3, -9)).toBe(-9)
  })

  it('opens the timeline view focused at a bucket', () => {
    const state = useBreakdownViewState()

    state.openTimelineAtBucket(7)

    expect(state.activeView.value).toBe('timeline')
    expect(state.timelineFocusBucket.value).toBe(7)
  })
})
