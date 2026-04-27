import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readVue(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')
}

describe('editor and overlay preview parity wiring', () => {
  it('keeps the editor preview meter freely resizable instead of forcing a computed height', () => {
    const source = readVue('./preview/PreviewArea.vue')

    expect(source).toContain("const meterStyle = computed(() => ({}))")
    expect(source).toContain("const STORAGE_KEY = 'flexi-editor-meter-height'")
    expect(source).toContain('resize: both;')
    expect(source).toContain('overflow: auto;')
    expect(source).not.toContain("height: isHorizontal.value ? '160px' : '300px'")
  })

  it('keeps overlay bars wired to measured width and color overrides like the editor preview', () => {
    const meterBar = readVue('../../../overlay/src/components/MeterBar.vue')
    const flexiBar = readVue('../../../shared/src/components/FlexiBar.vue')
    const meterView = readVue('../../../overlay/src/components/MeterView.vue')

    expect(meterBar).toContain("import FlexiBar from '@shared/components/FlexiBar.vue'")
    expect(meterBar).toContain('validate-style')
    expect(flexiBar).toContain('new ResizeObserver(updateBarWidth)')
    expect(flexiBar).toContain("barEl.value?.getBoundingClientRect().width")
    expect(flexiBar).toContain('() => props.colorOverrides')
    expect(flexiBar).toContain('() => barWidth.value')
    expect(flexiBar).toContain('flexShrink: 0')
    expect(meterView).toContain(':color-overrides="store.profile.overrides"')
    expect(meterView).not.toContain(':bar-width="barWidth"')
  })
})
