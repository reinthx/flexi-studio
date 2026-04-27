import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readVue(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')
}

describe('preset panel custom preset rendering', () => {
  it('renders uncategorized presets through a single template path', () => {
    const source = readVue('./PresetPanel.vue')

    expect(source).not.toContain('flat-list')
    expect(source).not.toContain('store.categories.length === 0')
    expect(source.match(/v-for="\{ preset, globalIndex \} in store\.uncategorizedPresets"/g)).toHaveLength(1)
  })
})
