import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readVue(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')
}

describe('editor and overlay preview parity wiring', () => {
  it('keeps the editor preview meter freely resizable instead of forcing a computed height', () => {
    const source = readVue('./preview/PreviewArea.vue')

    // Height restore behavior is covered by a mounted test
    // (PreviewArea.test.ts); this pins the resize affordance CSS.
    expect(source).toContain('resize: both;')
    expect(source).toContain('overflow: auto;')
    expect(source).not.toContain("height: isHorizontal.value ? '160px' : '300px'")
  })

  it('hides the full Breakout shortcut when the editor was opened from lite', () => {
    const app = readVue('../App.vue')

    expect(app).toContain("get('lite') === '1'")
    expect(app).toContain('v-if="!isLiteEditor"')
    expect(app).toContain('Open Breakdown')
  })
})
