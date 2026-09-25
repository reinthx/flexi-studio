/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import MeterView from './MeterView.vue'
import MeterBar from './MeterBar.vue'
import MeterHeader from './MeterHeader.vue'
import { DEFAULT_PROFILE } from '@shared/presets'
import { deepClone } from '@shared/styleResolver'
import type { Profile } from '@shared/configSchema'
import type { BarFrame, Frame } from '@shared/transitions'

const mocks = vi.hoisted(() => ({
  profile: null as unknown as Profile,
  frameValue: null as unknown as Frame | null,
  selfName: 'Tester McTestface',
  start: vi.fn(),
  stop: vi.fn(),
  setCombatantFilter: vi.fn(),
  toggleBlurNames: vi.fn(),
  setHeaderPinned: vi.fn(),
  setMergePets: vi.fn(),
  broadcastForCombatant: vi.fn(),
}))

vi.mock('../stores/liveData', () => ({
  // Mirror pinia setup-store semantics: values read through getters.
  useLiveDataStore: () => ({
    get profile() { return mocks.profile },
    get frame() { return mocks.frameValue },
    get selfName() { return mocks.selfName },
    get sessionPulls() { return [] },
    start: mocks.start,
    stop: mocks.stop,
    setCombatantFilter: mocks.setCombatantFilter,
    toggleBlurNames: mocks.toggleBlurNames,
    setHeaderPinned: mocks.setHeaderPinned,
    setMergePets: mocks.setMergePets,
    broadcastForCombatant: mocks.broadcastForCombatant,
  }),
}))

vi.mock('@shared/googleFonts', () => ({
  loadCustomFont: vi.fn(),
}))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function bar(name: string, fillFraction: number): BarFrame {
  return {
    name,
    job: name === 'Tester McTestface' ? 'WAR' : 'BRD',
    partyGroup: 'Party',
    fillFraction,
    displayValue: '90.0k',
    displayPct: '65',
    deaths: '0',
    crithit: '33',
    directhit: '17',
    tohit: '6',
    dps: '90.0k',
    enchps: '0',
    rdps: '93.0k',
    rawValue: 180000,
    rawDps: 90000,
    rawEnchps: 0,
    rawRdps: 93000,
    maxHit: 'Heavy Swing 42000',
    alpha: 1,
  }
}

function frame(): Frame {
  return {
    bars: [bar('Tester McTestface', 1), bar('Partner Example', 0.53)],
    encounterTitle: 'Mock Trial',
    encounterDuration: '00:02',
    totalDps: '137.5k',
    totalHps: '0',
    totalDtps: '6.0k',
    totalRdps: '140.0k',
    isActive: true,
  }
}

const mounted: Array<VueWrapper<InstanceType<typeof MeterView>>> = []

function mountView(props: Record<string, unknown> = {}) {
  const wrapper = mount(MeterView, { attachTo: document.body, props })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  const profile = deepClone(DEFAULT_PROFILE)
  profile.global.transitionDuration = 0
  mocks.profile = profile
  mocks.frameValue = null
  for (const fn of [mocks.start, mocks.stop, mocks.setCombatantFilter, mocks.toggleBlurNames,
    mocks.setHeaderPinned, mocks.setMergePets, mocks.broadcastForCombatant]) fn.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('MeterView', () => {
  it('starts the store on mount and stops on unmount', () => {
    const wrapper = mountView()
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(wrapper.find('.empty-state').text()).toContain('Waiting for combat data')
    expect(wrapper.findAllComponents(MeterBar)).toHaveLength(0)
    wrapper.unmount()
    expect(mocks.stop).toHaveBeenCalledOnce()
  })

  it('renders one row per bar with header totals', () => {
    mocks.frameValue = frame()
    mocks.profile.global.header.template = '{encounter} {totalDPS}'
    const wrapper = mountView()
    const rows = wrapper.findAllComponents(MeterBar)
    expect(rows.map(r => r.props('bar').name)).toEqual(['Tester McTestface', 'Partner Example'])
    expect(rows[0].props('containerWidth')).toBeGreaterThanOrEqual(0)
    const headers = wrapper.findAllComponents(MeterHeader)
    expect(headers).toHaveLength(1)
    expect(headers[0].text()).toContain('Mock Trial')
    expect(headers[0].text()).toContain('137.5k')
  })

  it('cycles the combatant filter through the header', async () => {
    mocks.frameValue = frame()
    const wrapper = mountView()
    await wrapper.find('.filter-btn').trigger('click')
    expect(mocks.setCombatantFilter).toHaveBeenCalledWith('alliance')
  })

  it('opens the breakdown for a clicked bar', async () => {
    mocks.frameValue = frame()
    const open = vi.fn()
    window.open = open as never
    const wrapper = mountView()
    await wrapper.findComponent(MeterBar).trigger('click')
    expect(mocks.broadcastForCombatant).toHaveBeenCalledWith('Tester McTestface')
    expect(open).toHaveBeenCalledOnce()
    expect(String(open.mock.calls[0][0])).toContain('#/breakdown')
    expect(window.localStorage.getItem('flexi-breakdown-init')).toBe('Tester McTestface')
  })

  it('does nothing on bar click when breakdown is disabled', async () => {
    mocks.frameValue = frame()
    const open = vi.fn()
    window.open = open as never
    const wrapper = mountView({ breakdownEnabled: false })
    await wrapper.findComponent(MeterBar).trigger('click')
    expect(mocks.broadcastForCombatant).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })
})
