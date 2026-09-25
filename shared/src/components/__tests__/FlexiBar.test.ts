/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FlexiBar from '../FlexiBar.vue'
import { DEFAULT_STYLE, type BarData } from '../../useBarStyles'

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
    rank: 2,
    ...overrides,
  }
}

function style() {
  return JSON.parse(JSON.stringify(DEFAULT_STYLE))
}

describe('FlexiBar mounted rendering', () => {
  it('sizes the fill with a transform and fades with alpha', () => {
    const wrapper = mount(FlexiBar, {
      props: {
        bar: bar(),
        styleConfig: style(),
        orientation: 'vertical',
        showRank: true,
        containerWidth: 320,
      },
    })
    expect(wrapper.html()).toContain('scaleX(0.5)')
    expect(wrapper.attributes('style')).toContain('opacity: 1')
  })

  it('renders bar text and refreshes it when the frame glides', async () => {
    const wrapper = mount(FlexiBar, {
      props: {
        bar: bar(),
        styleConfig: style(),
        orientation: 'vertical',
        showRank: true,
        containerWidth: 320,
      },
    })
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('1000')

    // Same identity pattern as interpolated frames: new object, new numbers.
    await wrapper.setProps({ bar: bar({ displayValue: '2000', fillFraction: 0.75 }) })
    expect(wrapper.text()).toContain('2000')
    expect(wrapper.text()).not.toContain('1000')
    expect(wrapper.html()).toContain('scaleX(0.75)')
  })

  it('hides the fill at zero fraction', async () => {
    const wrapper = mount(FlexiBar, {
      props: {
        bar: bar({ fillFraction: 0 }),
        styleConfig: style(),
        orientation: 'vertical',
        showRank: true,
        containerWidth: 320,
      },
    })
    expect(wrapper.html()).toContain('display: none')
  })
})
