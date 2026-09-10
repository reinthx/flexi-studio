import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function read(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')
}

describe('lite overlay wiring', () => {
  it('uses a meter-only app entry without importing the Breakout popout', () => {
    const liteApp = read('./LiteApp.vue')
    const liteMain = read('./main-lite.ts')
    const liteHtml = read('../lite.html')

    expect(liteApp).toContain('<MeterView :breakdown-enabled="false" />')
    expect(liteApp).not.toContain('AbilityBreakdownPopout')
    expect(liteMain).toContain("import LiteApp from './LiteApp.vue'")
    expect(liteMain).not.toContain("import App from './App.vue'")
    expect(liteHtml).toContain('/src/main-lite.ts')
    expect(liteHtml).toContain('overflow: hidden')
  })

  it('builds lite to its own output with the Breakout store flag disabled', () => {
    const viteConfig = read('../vite.config.ts')
    const liveData = read('./stores/liveData.ts')

    expect(viteConfig).toContain("mode === 'lite'")
    expect(viteConfig).toContain("../dist/overlay-lite")
    expect(viteConfig).toContain("isLite ? 'lite.html' : 'index.html'")
    expect(viteConfig).toContain('__FLEXI_LITE__')
    expect(liveData).toContain('const BREAKDOWN_ENABLED = !')
    expect(liveData).toContain("addListener('LogLine', onLogLine)")
    expect(liveData).toContain('onLiteLogLine(event)')
    expect(liveData).toContain('if (BREAKDOWN_ENABLED) persistPulls()')
  })

  it('keeps Breakout actions conditional so lite can render the same meter without popouts', () => {
    const meterView = read('./components/MeterView.vue')

    expect(meterView).toContain('breakdownEnabled?: boolean')
    expect(meterView).toContain("indexOf('/lite/')")
    expect(meterView).toContain("url.searchParams.set('lite', '1')")
    expect(meterView).toContain('overflow: hidden;')
    expect(meterView).toContain(':on-breakdown="canUseBreakdown ? openPullDashboard : undefined"')
    expect(meterView).toContain('@click="canUseBreakdown ? openAbilityBreakdown(bar.name) : undefined"')
  })
})
