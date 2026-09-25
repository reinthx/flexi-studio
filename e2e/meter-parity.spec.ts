import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_PROFILE } from '../shared/src/presets'
import type { Profile } from '../shared/src/configSchema'

const EDITOR_URL = 'http://127.0.0.1:4173'
const OVERLAY_URL = 'http://127.0.0.1:4174'

// 1px transparent PNG — deterministic texture source with no network.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function shapeCutProfile(): Profile {
  const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE)) as Profile
  // Snap frames for deterministic geometry (also disables FLIP).
  profile.global.transitionDuration = 0
  // Shape-cut right edge.
  profile.default.shape = { ...profile.default.shape, rightEdge: 'slant-a', edgeDepth: 16 }
  // Texture fill so rank-1 tinting has something to tint.
  profile.default.fill = {
    type: 'texture',
    texture: { src: PIXEL_PNG, repeat: 'stretch', opacity: 1, blendMode: 'normal' },
  }
  // Rank-1 solid red becomes a multiply tint on the texture.
  profile.global.rankIndicator = {
    ...profile.global.rankIndicator,
    rank1Enabled: true,
    rank1StyleEnabled: true,
    rank1Style: { fill: { type: 'solid', color: '#ff0000' } },
  }
  // Text outline + shadow that must not be clipped.
  profile.default.label = {
    ...profile.default.label,
    outline: { enabled: true, color: '#000000', width: 2, gradient: null },
    shadow: { ...(profile.default.label.shadow ?? {}), enabled: true, color: '#000000', blur: 4, offsetX: 1, offsetY: 1 },
  }
  return profile
}

async function seedProfile(page: Page, profile: Profile) {
  // The editor reads act-flexi-profile; the overlay pre-loads
  // act-flexi-overlay-config synchronously at startup (and falls back to the
  // editor key via polling). A synced environment has both, so seed both.
  await page.addInitScript(p => {
    localStorage.setItem('act-flexi-profile', p)
    localStorage.setItem('act-flexi-overlay-config', p)
  }, JSON.stringify(profile))
}

function combatDataEvent() {
  return {
    type: 'CombatData',
    isActive: 'true',
    Encounter: { title: 'Mock Trial', duration: '00:02', ENCDPS: '137500', ENCHPS: '0', DTRPS: '6000' },
    Combatant: {
      'Tester McTestface': {
        name: 'Tester McTestface', Job: 'WAR', encdps: '90000', damage: '180000',
        'damage%': '65', deaths: '0', enchps: '0', rdps: '93000', maxhit: 'Heavy Swing-42000',
      },
      'Partner Example': {
        name: 'Partner Example', Job: 'BRD', encdps: '47500', damage: '95000',
        'damage%': '35', deaths: '0', enchps: '0', rdps: '47000', maxhit: 'Burst Shot-30000',
      },
    },
  }
}

async function installOverlayPluginMock(page: Page) {
  await page.addInitScript(event => {
    const listeners = new Map<string, Array<(data: unknown) => void>>()
    window.addOverlayListener = (name: string, callback: (data: unknown) => void) => {
      const callbacks = listeners.get(name) ?? []
      callbacks.push(callback)
      listeners.set(name, callbacks)
    }
    window.removeOverlayListener = (name: string, callback: (data: unknown) => void) => {
      const callbacks = listeners.get(name) ?? []
      listeners.set(name, callbacks.filter(existing => existing !== callback))
    }
    window.callOverlayHandler = async () => null
    window.startOverlayEvents = () => {
      listeners.get('ChangePrimaryPlayer')?.forEach(callback => callback({
        type: 'ChangePrimaryPlayer', charID: 1, charName: 'Tester McTestface',
      }))
      listeners.get('CombatData')?.forEach(callback => callback(event))
    }
  }, combatDataEvent())
}

async function expectNoConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    if (msg.text().includes('Failed to load resource')) return
    errors.push(msg.text())
  })
  page.on('pageerror', error => errors.push(error.message))
  return errors
}

interface RowMetrics {
  rows: number
  leftGap: number
  rightGap: number
  transform: string
  innerExists: boolean
  innerBg: string | null
  innerBlend: string | null
  innerImage: string | null
  labels: number
  outlines: number
  clipped: boolean
}

async function measureRankOneRow(page: Page): Promise<RowMetrics> {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-bar-row]'))
    const first = rows[0] as HTMLElement
    const rowRect = first.getBoundingClientRect()
    const fill = first.querySelector('[data-bar-fill]') as HTMLElement
    const fillRect = fill.getBoundingClientRect()
    const fillCS = getComputedStyle(fill)
    const inner = first.querySelector('[data-bar-fill-inner]') as HTMLElement | null
    const innerCS = inner ? getComputedStyle(inner) : null
    const labels = Array.from(first.querySelectorAll('[data-bar-label]')) as HTMLElement[]
    const clipped = labels.some(span => {
      let el: HTMLElement | null = span
      while (el && el !== first) {
        const cs = getComputedStyle(el)
        if (cs.overflowX === 'hidden' || cs.overflowY === 'hidden') return true
        el = el.parentElement
      }
      return false
    })
    return {
      rows: rows.length,
      leftGap: Math.abs(fillRect.left - rowRect.left),
      rightGap: Math.abs(fillRect.right - rowRect.right),
      transform: fillCS.transform,
      innerExists: !!inner,
      innerBg: innerCS?.backgroundColor ?? null,
      innerBlend: innerCS?.backgroundBlendMode ?? null,
      innerImage: innerCS?.backgroundImage ?? null,
      labels: labels.length,
      outlines: first.querySelectorAll('[data-bar-label-outline]').length,
      clipped,
    }
  })
}

async function expectShapeCutParity(page: Page) {
  await page.locator('[data-bar-row]').first().waitFor({ state: 'visible' })
  const m = await measureRankOneRow(page)
  // Rank 1 runs at fillFraction 1: the fill must complete both edges.
  expect(m.rows).toBeGreaterThan(0)
  expect(m.leftGap).toBeLessThanOrEqual(1.5)
  expect(m.rightGap).toBeLessThanOrEqual(1.5)
  // Compositor-sized fill (transform), not a layout width.
  expect(m.transform).not.toBe('none')
  // Rank-1 texture tint lands on the inner div as a multiply tint.
  expect(m.innerExists).toBe(true)
  expect(m.innerBg).toBe('rgb(255, 0, 0)')
  expect(m.innerBlend).toBe('multiply')
  expect(m.innerImage ?? '').toContain('url(')
  // Outlined/shadowed labels render and escape clipping.
  expect(m.labels).toBeGreaterThan(0)
  expect(m.outlines).toBeGreaterThan(0)
  expect(m.clipped).toBe(false)
}

test('shape-cut preset completes edges and tints in the overlay', async ({ page }) => {
  const errors = await expectNoConsoleErrors(page)
  await seedProfile(page, shapeCutProfile())
  await installOverlayPluginMock(page)

  await page.goto(OVERLAY_URL)
  await expect(page.locator('[data-bar-row]').first()).toBeVisible()
  await expectShapeCutParity(page)
  expect(errors).toEqual([])
})

test('shape-cut preset completes edges and tints in the editor preview', async ({ page }) => {
  const errors = await expectNoConsoleErrors(page)
  await seedProfile(page, shapeCutProfile())

  // The editor preview runs on internal mock data — no event dispatch needed.
  await page.goto(`${EDITOR_URL}/#/editor`)
  await expect(page.locator('[data-bar-row]').first()).toBeVisible({ timeout: 15000 })
  await expectShapeCutParity(page)
  expect(errors).toEqual([])
})
