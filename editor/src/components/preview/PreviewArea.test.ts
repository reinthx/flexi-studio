/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import PreviewArea from './PreviewArea.vue'
import PreviewBar from './PreviewBar.vue'
import { DEFAULT_PROFILE } from '@shared/presets'
import { deepClone } from '@shared/styleResolver'
import { resolveBarStyle } from '@shared/styleResolver'
import type { Profile } from '@shared/configSchema'
import type { Frame } from '@shared/transitions'

const mocks = vi.hoisted(() => ({
  frame: null as unknown as Ref<Frame | null>,
  selfName: 'Alice',
  profile: null as unknown as Profile,
  measureRef: vi.fn(),
}))

vi.mock('../../stores/liveData', () => ({
  // Mirror pinia setup-store semantics: refs are unwrapped on access, so the
  // component receives values (and stays subscribed to the underlying ref).
  useLiveDataStore: () => ({
    get frame() { return mocks.frame.value },
    get selfName() { return mocks.selfName },
  }),
}))

vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({ profile: mocks.profile }),
}))

vi.mock('@shared/listWidth', () => ({
  useListWidth: () => ({ listWidth: 320, measureRef: mocks.measureRef }),
}))

function bar(name: string, fillFraction: number, extra: Record<string, unknown> = {}) {
  return {
    name,
    job: name === 'Alice' ? 'WAR' : 'DRG',
    partyGroup: 'Party',
    fillFraction,
    displayValue: '1000',
    displayPct: '50',
    deaths: '0',
    crithit: '10',
    directhit: '20',
    tohit: '90',
    dps: '1000',
    enchps: '0',
    rdps: '900',
    rawValue: 1000,
    rawDps: 1000,
    rawEnchps: 0,
    rawRdps: 900,
    maxHit: 'Hit 1000',
    alpha: 1,
    ...extra,
  }
}

function frame(names: string[]): Frame {
  return {
    bars: names.map((name, i) => bar(name, 1 - i * 0.3)),
    encounterTitle: 'Test',
    encounterDuration: '01:00',
    totalDps: '2000',
    totalHps: '0',
    totalDtps: '0',
    totalRdps: '1900',
    isActive: true,
  }
}

const mounted: Array<VueWrapper<InstanceType<typeof PreviewArea>>> = []

function mountArea() {
  const wrapper = mount(PreviewArea, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => {
  mocks.frame = ref(null)
  mocks.profile = deepClone(DEFAULT_PROFILE)
  mocks.measureRef.mockReset()
  window.sessionStorage.clear()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('PreviewArea mounted wiring', () => {
  it('shows the empty state with no frame and one row per bar with a frame', async () => {
    const wrapper = mountArea()
    expect(wrapper.find('.no-data').exists()).toBe(true)
    expect(wrapper.findAllComponents(PreviewBar)).toHaveLength(0)

    mocks.frame.value = frame(['Alice', 'Bob'])
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.no-data').exists()).toBe(false)
    const rows = wrapper.findAllComponents(PreviewBar)
    expect(rows.map(r => r.props('bar').name)).toEqual(['Alice', 'Bob'])
  })

  it('passes rank, self, resolved style, and measured width to each row', async () => {
    const wrapper = mountArea()
    mocks.frame.value = frame(['Alice', 'Bob'])
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAllComponents(PreviewBar)
    expect(rows[0].props('bar')).toMatchObject({ rank: 1, barIndex: 0, isRank1: true, isSelf: true })
    expect(rows[1].props('bar')).toMatchObject({ rank: 2, barIndex: 1, isRank1: false, isSelf: false })
    for (const [i, name] of ['Alice', 'Bob'].entries()) {
      expect(rows[i].props('styleConfig')).toEqual(
        resolveBarStyle(rows[i].props('bar').job, name, i + 1, mocks.profile, mocks.selfName),
      )
    }
    expect(rows[0].props('containerWidth')).toBe(320)
    expect(rows[0].props('colorOverrides')).toBe(mocks.profile.overrides)
  })

  it('restores the persisted meter height on mount', () => {
    window.sessionStorage.setItem('flexi-editor-meter-height', '250')
    const wrapper = mountArea()
    expect(wrapper.find('.preview-meter').attributes('style')).toContain('height: 250px')
  })

  it('renders gliding fills with transform sizing in the DOM', async () => {
    const wrapper = mountArea()
    mocks.frame.value = frame(['Alice'])
    await wrapper.vm.$nextTick()

    const html = wrapper.find('.preview-meter').html()
    expect(html).toContain('scaleX(1)')
    expect(wrapper.text()).toContain('Alice')
  })
})
