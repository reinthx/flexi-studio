/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import MeterHeader from './MeterHeader.vue'
import HeaderBar from '@shared/HeaderBar.vue'
import { DEFAULT_PROFILE } from '@shared/presets'
import { deepClone } from '@shared/styleResolver'
import type { CombatantFilter, GlobalConfig, HeaderConfig } from '@shared/configSchema'

function global(overrides: Partial<GlobalConfig> = {}): GlobalConfig {
  return { ...deepClone(DEFAULT_PROFILE).global, ...overrides }
}

function header(overrides: Partial<HeaderConfig> = {}): HeaderConfig {
  return { ...deepClone(DEFAULT_PROFILE).global.header, template: '{encounter} {duration}', ...overrides }
}

function mountHeader(props: Record<string, unknown> = {}) {
  return mount(MeterHeader, {
    global: { plugins: [createPinia()] },
    props: {
      config: header(),
      encounterTitle: 'Mock Trial',
      encounterDuration: '00:02',
      totalDPS: '137.5k',
      totalHPS: '0',
      pullNumber: 3,
      pullCount: 5,
      global: global(),
      ...props,
    },
  })
}

describe('MeterHeader', () => {
  it('renders template tokens for the encounter', () => {
    const wrapper = mountHeader()
    expect(wrapper.text()).toContain('Mock Trial 00:02')
    wrapper.unmount()
  })

  it('labels the combatant filter and cycles all → alliance → party → self', async () => {
    const seen: CombatantFilter[] = []
    const wrapper = mountHeader({
      global: global({ combatantFilter: 'all' }),
      onSetCombatantFilter: (f: CombatantFilter) => seen.push(f),
    })
    const btn = wrapper.find('.filter-btn')
    expect(btn.text()).toBe('ALL')

    await btn.trigger('click')
    await wrapper.setProps({ global: global({ combatantFilter: 'alliance' }) })
    expect(wrapper.find('.filter-btn').text()).toBe('ALLIANCE')
    await btn.trigger('click')
    await wrapper.setProps({ global: global({ combatantFilter: 'party' }) })
    expect(wrapper.find('.filter-btn').text()).toBe('PARTY')
    await btn.trigger('click')
    await wrapper.setProps({ global: global({ combatantFilter: 'self' }) })
    expect(wrapper.find('.filter-btn').text()).toBe('SELF')
    await btn.trigger('click')
    expect(seen).toEqual(['alliance', 'party', 'self', 'all'])
    wrapper.unmount()
  })

  it('falls back to legacy selfOnly/partyOnly flags for the filter', () => {
    const self = mountHeader({ global: global({ combatantFilter: undefined as never, selfOnly: true }) })
    expect(self.find('.filter-btn').text()).toBe('SELF')
    self.unmount()
    const party = mountHeader({ global: global({ combatantFilter: undefined as never, partyOnly: true }) })
    expect(party.find('.filter-btn').text()).toBe('ALLIANCE')
    party.unmount()
  })

  it('reflects merge-pets and blur toggles', async () => {
    const wrapper = mountHeader({ global: global({ mergePets: false, blurNames: true }) })
    expect(wrapper.find('.merge-btn').attributes('title')).toBe('Unmerge Pets')
    expect(wrapper.find('.merge-btn span').attributes('style')).toContain('line-through')
    expect(wrapper.find('.merge-btn.active').exists()).toBe(false)
    await wrapper.find('.merge-btn').trigger('click')
    // No handler wired → no crash, no state change by itself.
    wrapper.unmount()
  })

  it('shows settings actions only when handlers are provided', async () => {
    const bare = mountHeader()
    expect(bare.text()).not.toContain('Editor')
    expect(bare.text()).not.toContain('Pulls')
    bare.unmount()

    const wrapper = mountHeader({
      showSettings: true,
      onSettings: () => {},
      onBreakdown: () => {},
    })
    expect(wrapper.text()).toContain('Editor')
    expect(wrapper.text()).toContain('Pulls')
    wrapper.unmount()
  })

  it('pins the footer unconditionally and honors the header pin', () => {
    const footer = mountHeader({ isFooter: true, config: header({ pinned: false }) })
    expect(footer.findComponent(HeaderBar).props('isHidden')).toBe(false)
    footer.unmount()

    const unpinned = mountHeader({ config: header({ pinned: false }) })
    expect(unpinned.findComponent(HeaderBar).props('isHidden')).toBe(true)
    unpinned.unmount()
  })
})
