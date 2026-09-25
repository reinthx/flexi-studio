/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useMeterList, meterFlipEnabled, type MeterList } from '../meterList'
import { DEFAULT_PROFILE } from '../presets'
import { deepClone } from '../styleResolver'
import type { Profile } from '../configSchema'
import type { BarFrame, Frame } from '../transitions'

function bar(name: string, fillFraction: number): BarFrame {
  return {
    name,
    job: 'WAR',
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

describe('useMeterList', () => {
  it('resolves rank, self, style, and width for each row', () => {
    let captured: MeterList | null = null
    const Harness = defineComponent({
      props: {
        profile: { type: Object, required: true },
        frame: { type: Object, required: false, default: null },
      },
      setup(props) {
        captured = useMeterList({
          profile: () => props.profile as Profile,
          selfName: () => 'Alice',
          frame: () => props.frame as Frame | null,
        })
        return () => h('div', captured!.bars.value.map(b => `${b.rank}:${b.name}`).join(','))
      },
    })
    const profile = deepClone(DEFAULT_PROFILE)
    const wrapper = mount(Harness, { props: { profile, frame: frame(['Alice', 'Bob']) } })

    expect(wrapper.text()).toBe('1:Alice,2:Bob')
    expect(captured!.bars.value[0]).toMatchObject({ rank: 1, barIndex: 0, isRank1: true, isSelf: true })
    expect(captured!.bars.value[1]).toMatchObject({ rank: 2, barIndex: 1, isRank1: false, isSelf: false })
    expect(captured!.bars.value[0].style.fill).toBeDefined()
    expect(typeof captured!.flip.setRowEl).toBe('function')
    expect(typeof captured!.measureBars).toBe('function')
    wrapper.unmount()
  })

  it('keeps style identity stable across gliding frames and follows reorders', async () => {
    let captured: MeterList | null = null
    const Harness = defineComponent({
      props: {
        profile: { type: Object, required: true },
        frame: { type: Object, required: false, default: null },
      },
      setup(props) {
        captured = useMeterList({
          profile: () => props.profile as Profile,
          selfName: () => 'Alice',
          frame: () => props.frame as Frame | null,
        })
        return () => h('div', captured!.bars.value.map(b => b.name).join(','))
      },
    })
    const wrapper = mount(Harness, {
      props: { profile: deepClone(DEFAULT_PROFILE), frame: frame(['Alice', 'Bob']) },
    })
    const firstStyle = captured!.bars.value[0].style

    // New frame objects, same text: style object is reused, not re-resolved.
    await wrapper.setProps({ frame: frame(['Alice', 'Bob']) })
    expect(captured!.bars.value[0].style).toBe(firstStyle)

    await wrapper.setProps({ frame: frame(['Bob', 'Alice']) })
    expect(wrapper.text()).toBe('Bob,Alice')
    expect(captured!.bars.value[0]).toMatchObject({ name: 'Bob', rank: 1, isRank1: true })
    wrapper.unmount()
  })

  it('renders empty with no frame', () => {
    const Harness = defineComponent({
      props: {
        profile: { type: Object, required: true },
        frame: { type: Object, required: false, default: null },
      },
      setup(props) {
        const list = useMeterList({
          profile: () => props.profile as Profile,
          selfName: () => 'Alice',
          frame: () => props.frame as Frame | null,
        })
        return () => h('div', list.bars.value.map(b => b.name).join(','))
      },
    })
    const wrapper = mount(Harness, { props: { profile: deepClone(DEFAULT_PROFILE), frame: null } })
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })
})

describe('meterFlipEnabled', () => {
  it('is on by default, including for profiles saved before the toggle', () => {
    expect(DEFAULT_PROFILE.global.rankSwapAnimation).toBe(true)
    expect(meterFlipEnabled({ transitionDuration: 900, rankSwapAnimation: true })).toBe(true)
    expect(meterFlipEnabled({ transitionDuration: 900 })).toBe(true)
  })

  it('respects the profile toggle and snap durations', () => {
    expect(meterFlipEnabled({ transitionDuration: 900, rankSwapAnimation: false })).toBe(false)
    expect(meterFlipEnabled({ transitionDuration: 0, rankSwapAnimation: true })).toBe(false)
    expect(meterFlipEnabled({})).toBe(false)
  })
})
