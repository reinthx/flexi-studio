/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MeterBar from './MeterBar.vue'
import FlexiBar from '@shared/components/FlexiBar.vue'
import { DEFAULT_STYLE, type BarData } from '@shared/useBarStyles'

function bar(overrides: Partial<BarData> = {}): BarData {
  return {
    name: 'Alice',
    job: 'WAR',
    fillFraction: 0.5,
    displayValue: '1000',
    displayPct: '50',
    deaths: '0',
    crithit: '10',
    directhit: '20',
    dps: '1000',
    enchps: '0',
    rdps: '900',
    rawValue: 1000,
    rawDps: 1000,
    rawEnchps: 0,
    rawRdps: 900,
    maxHit: 'Hit 1000',
    alpha: 1,
    rank: 2,
    ...overrides,
  }
}

describe('MeterBar', () => {
  it('forwards bar, style, and measured width into FlexiBar with overlay flags', () => {
    const style = JSON.parse(JSON.stringify(DEFAULT_STYLE))
    const wrapper = mount(MeterBar, {
      props: {
        bar: bar(),
        styleConfig: style,
        orientation: 'vertical',
        showRank: true,
        valueFormat: 'abbreviated',
        barIndex: 1,
        containerWidth: 320,
      },
    })
    const inner = wrapper.findComponent(FlexiBar)
    expect(inner.exists()).toBe(true)
    expect(inner.props('bar')).toMatchObject({ name: 'Alice' })
    expect(inner.props('styleConfig')).toEqual(style)
    expect(inner.props('containerWidth')).toBe(320)
    expect(inner.props('clickable')).toBe(true)
    expect(inner.props('validateStyle')).toBe(true)
    expect(inner.props('expandedShadowFilter')).toBe(true)
  })

  it('emits click when the bar is clicked', async () => {
    const wrapper = mount(MeterBar, {
      props: {
        bar: bar(),
        styleConfig: JSON.parse(JSON.stringify(DEFAULT_STYLE)),
        orientation: 'vertical',
        showRank: true,
      },
    })
    await wrapper.findComponent(FlexiBar).trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
