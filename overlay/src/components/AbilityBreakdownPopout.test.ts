/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import AbilityBreakdownPopout from './AbilityBreakdownPopout.vue'
import ActorRail from './AbilityBreakdown/ActorRail.vue'

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  posted: unknown[] = []
  closed = false
  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this)
  }
  postMessage(data: unknown) {
    this.posted.push(data)
  }
  close() {
    this.closed = true
  }
  deliver(data: unknown) {
    this.onmessage?.({ data })
  }
}

function snapshot(extra: Record<string, unknown> = {}) {
  return {
    type: 'encounterData',
    timestamp: Date.now(),
    abilityData: {
      'Tester McTestface': {
        'heavy-swing': {
          abilityId: 'heavy-swing',
          abilityName: 'Heavy Swing',
          totalDamage: 180000,
          hits: 6,
          maxHit: 42000,
          minHit: 22000,
        },
      },
      'Partner Example': {
        'burst-shot': {
          abilityId: 'burst-shot',
          abilityName: 'Burst Shot',
          totalDamage: 95000,
          hits: 4,
          maxHit: 30000,
          minHit: 20000,
        },
      },
    },
    dpsByCombatant: { 'Tester McTestface': 90000 },
    pullList: [
      { index: null, encounterId: 'Mock Trial', encounterName: 'Mock Trial', duration: '00:02' },
    ],
    selfName: 'Tester McTestface',
    ...extra,
  }
}

const mounted: Array<VueWrapper<InstanceType<typeof AbilityBreakdownPopout>>> = []

function mountPopout() {
  const wrapper = shallowMount(AbilityBreakdownPopout, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

function actorRailSelected(wrapper: VueWrapper<InstanceType<typeof AbilityBreakdownPopout>>) {
  return wrapper.findComponent(ActorRail).props('selectedName')
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeBroadcastChannel.instances = []
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  window.localStorage.clear()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AbilityBreakdownPopout load flow', () => {
  it('applies a valid snapshot with the payload-selected combatant', async () => {
    window.localStorage.setItem('flexi-breakdown-snapshot', JSON.stringify(snapshot({ selectedCombatant: 'Tester McTestface' })))
    const wrapper = mountPopout()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.bp-waiting').exists()).toBe(false)
    expect(wrapper.find('.bp-analysis-title').text()).toBe('Mock Trial')
    expect(actorRailSelected(wrapper)).toBe('Tester McTestface')
    // A healthy snapshot stays cached for reloads.
    expect(window.localStorage.getItem('flexi-breakdown-snapshot')).not.toBeNull()
  })

  it('preselects the init name when the payload names no combatant', async () => {
    window.localStorage.setItem('flexi-breakdown-snapshot', JSON.stringify(snapshot()))
    window.localStorage.setItem('flexi-breakdown-init', 'Tester McTestface')
    const wrapper = mountPopout()
    await wrapper.vm.$nextTick()

    expect(actorRailSelected(wrapper)).toBe('Tester McTestface')
    expect(window.localStorage.getItem('flexi-breakdown-init')).toBeNull()
  })

  it('drops malformed snapshots and waits for data', async () => {
    window.localStorage.setItem('flexi-breakdown-snapshot', '{not json')
    const wrapper = mountPopout()
    await wrapper.vm.$nextTick()

    expect(window.localStorage.getItem('flexi-breakdown-snapshot')).toBeNull()
    expect(wrapper.find('.bp-waiting').exists()).toBe(true)
  })

  it('drops stale snapshots older than the max age', async () => {
    window.localStorage.setItem(
      'flexi-breakdown-snapshot',
      JSON.stringify(snapshot({ timestamp: Date.now() - 120_000, selectedCombatant: 'Tester McTestface' })),
    )
    const wrapper = mountPopout()
    await wrapper.vm.$nextTick()

    expect(window.localStorage.getItem('flexi-breakdown-snapshot')).toBeNull()
    expect(wrapper.find('.bp-waiting').exists()).toBe(true)
  })

  it('requests live data over broadcast and applies encounter messages', async () => {
    const wrapper = mountPopout()
    const channel = FakeBroadcastChannel.instances.at(-1)!
    expect(channel.name).toBe('flexi-breakdown')
    expect(channel.posted).toEqual([{ type: 'request' }])

    await vi.advanceTimersByTimeAsync(200)
    expect(channel.posted.filter(p => (p as { type: string }).type === 'request').length).toBeGreaterThan(1)

    channel.deliver(snapshot({ selectedCombatant: 'Tester McTestface' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bp-waiting').exists()).toBe(false)
    expect(actorRailSelected(wrapper)).toBe('Tester McTestface')

    channel.deliver({ type: 'selectCombatant', name: 'Partner Example' })
    await wrapper.vm.$nextTick()
    expect(actorRailSelected(wrapper)).toBe('Partner Example')
  })

  it('switches views on setView messages', async () => {
    window.localStorage.setItem('flexi-breakdown-snapshot', JSON.stringify(snapshot({ selectedCombatant: 'Tester McTestface' })))
    const wrapper = mountPopout()
    await wrapper.vm.$nextTick()

    const pullsTab = wrapper.findAll('.bp-view-tab').find(b => b.text().includes('Pulls'))!
    expect(pullsTab.classes()).not.toContain('active')
    FakeBroadcastChannel.instances.at(-1)!.deliver({ type: 'setView', view: 'pulls' })
    await wrapper.vm.$nextTick()
    expect(pullsTab.classes()).toContain('active')
  })
})
