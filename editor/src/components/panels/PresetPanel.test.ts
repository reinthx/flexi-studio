/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import PresetPanel from './PresetPanel.vue'
import { usePresetsStore } from '../../stores/presets'

const mocks = vi.hoisted(() => ({
  profile: {
    name: 'Default',
    global: { opacity: 1 },
    default: {},
    overrides: {},
  },
  applyProfile: vi.fn(),
}))

vi.mock('../../stores/config', () => ({
  useConfigStore: () => ({ profile: mocks.profile, applyProfile: mocks.applyProfile }),
}))

function readVue(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')
}

const mounted: Array<VueWrapper<InstanceType<typeof PresetPanel>>> = []

beforeEach(() => {
  vi.resetModules()
  setActivePinia(createPinia())
  window.localStorage.clear()
  mocks.profile = { name: 'Default', global: { opacity: 1 }, default: {}, overrides: {} }
  mocks.applyProfile.mockReset()
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

function mountPanel() {
  const wrapper = mount(PresetPanel, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

function seedCustom(name: string, profile: Record<string, unknown> = {}) {
  const store = usePresetsStore()
  store.customPresets = [{ name, category: '', profile: { ...mocks.profile, ...profile } as never }]
  return store
}

function buttonByText(wrapper: { findAll: (sel: string) => Array<{ text: () => string }> }, text: string) {
  const found = wrapper.findAll('button').find(b => b.text() === text)
  if (!found) throw new Error(`button "${text}" not found`)
  return found as unknown as { trigger: (e: string) => Promise<void> }
}

function confirmModal() {
  const modal = document.body.querySelector('.modal-confirm')
  if (!modal) throw new Error('confirm modal not found')
  return modal as HTMLElement
}

async function clickModalButton(wrapper: { vm: { $nextTick: () => Promise<void> } }, text: string): Promise<void> {
  const btn = Array.from(confirmModal().querySelectorAll('button')).find(b => b.textContent === text)
  if (!btn) throw new Error(`modal button "${text}" not found`)
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await wrapper.vm.$nextTick()
}

describe('preset panel custom preset rendering', () => {
  it('renders uncategorized presets through a single template path', () => {
    const source = readVue('./PresetPanel.vue')

    expect(source).not.toContain('flat-list')
    expect(source).not.toContain('store.categories.length === 0')
    expect(source.match(/v-for="\{ preset, globalIndex \} in store\.uncategorizedPresets"/g)).toHaveLength(1)
  })
})

describe('preset panel interactions', () => {
  it('saves the current profile under a new name and clears the input', async () => {
    const wrapper = mountPanel()
    const store = usePresetsStore()

    await wrapper.find('.preset-actions .preset-input').setValue('My Look')
    await buttonByText(wrapper, 'Save').trigger('click')

    expect(store.customPresets).toHaveLength(1)
    expect(store.customPresets[0].name).toBe('My Look')
    expect(store.customPresets[0].profile.global.opacity).toBe(1)
    expect((wrapper.find('.preset-actions .preset-input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('.preset-row').text()).toContain('My Look')
  })

  it('asks for confirmation before overwriting a duplicate name', async () => {
    const wrapper = mountPanel()
    const store = usePresetsStore()
    seedCustom('Dup')
    await wrapper.vm.$nextTick()
    mocks.profile = { ...mocks.profile, global: { opacity: 0.5 } }

    await wrapper.find('.preset-actions .preset-input').setValue('Dup')
    await buttonByText(wrapper, 'Save').trigger('click')

    expect(confirmModal().textContent).toContain('already exists')
    await clickModalButton(wrapper, 'Yes')

    expect(store.customPresets).toHaveLength(1)
    expect(store.customPresets[0].profile.global.opacity).toBe(0.5)
    expect(document.body.querySelector('.modal-confirm')).toBeNull()
  })

  it('deletes a preset through the confirm modal', async () => {
    const wrapper = mountPanel()
    const store = usePresetsStore()
    seedCustom('Gone')
    await wrapper.vm.$nextTick()

    const deleteBtn = wrapper.find('.preset-row button[title="Delete"]')
    await deleteBtn.trigger('click')
    expect(confirmModal().textContent).toContain('Delete preset')
    await clickModalButton(wrapper, 'Yes')

    expect(store.customPresets).toEqual([])
    expect(wrapper.find('.preset-row').exists()).toBe(false)
  })

  it('applies a custom preset through the config store', async () => {
    const wrapper = mountPanel()
    seedCustom('Apply Me', { global: { opacity: 0.3 } })
    await wrapper.vm.$nextTick()

    await wrapper.find('.preset-row .preset-btn.full').trigger('click')
    expect(mocks.applyProfile).toHaveBeenCalledOnce()
    expect(mocks.applyProfile.mock.calls[0][0].global.opacity).toBe(0.3)
  })
})
