import { expect, test, type Locator, type Page } from '@playwright/test'

const EDITOR_URL = 'http://127.0.0.1:4173'
const OVERLAY_URL = 'http://127.0.0.1:4174'

function breakdownSnapshot() {
  const now = Date.now()
  return {
    type: 'encounterData',
    timestamp: now,
    abilityData: {
      'Tester McTestface': {
        'heavy-swing': {
          abilityId: 'heavy-swing',
          abilityName: 'Heavy Swing',
          totalDamage: 180000,
          hits: 6,
          critHits: 2,
          directHits: 1,
          critDirectHits: 1,
          maxHit: 42000,
          minHit: 22000,
          targets: { 'Training Boss': { total: 180000, hits: 6 } },
        },
      },
    },
    dpsTimeline: {
      'Tester McTestface': [90000, 90000],
    },
    hpsTimeline: {},
    dtakenTimeline: {
      'Tester McTestface': [12000],
    },
    dpsByCombatant: {
      'Tester McTestface': 90000,
    },
    damageByCombatant: {
      'Tester McTestface': 180000,
    },
    rdpsByCombatant: {
      'Tester McTestface': 93000,
    },
    rdpsGiven: {},
    rdpsTaken: {},
    damageTakenData: {},
    healingReceivedData: {},
    hitData: {},
    deaths: [],
    combatantIds: {
      'Tester McTestface': '10AAAAAA',
      'Training Boss': '40000001',
    },
    combatantJobs: {
      'Tester McTestface': 'WAR',
    },
    castData: {},
    resourceData: {
      'Training Boss': [
        { t: 0, currentHp: 75000, maxHp: 100000, hp: 0.75 },
      ],
    },
    selfName: 'Tester McTestface',
    blurNames: false,
    partyNames: ['Tester McTestface'],
    partyData: [
      { id: 1, name: 'Tester McTestface', inParty: true, partyType: 'Party', job: 'WAR' },
    ],
    encounterDurationSec: 2,
    pullIndex: null,
    selectedCombatant: 'Tester McTestface',
    pullList: [
      {
        index: null,
        encounterId: 'Mock Trial',
        encounterName: 'Mock Trial',
        duration: '00:02',
        pullNumber: 0,
        pullCount: 0,
        isFirstInEncounter: true,
        dps: 137500,
        rdps: 140000,
        hps: 0,
        dtps: 6000,
        deaths: 0,
        damageTaken: 12000,
        primaryEnemyName: 'Training Boss',
        primaryEnemyCurrentHp: 75000,
        primaryEnemyMaxHp: 100000,
        bossPercent: 75,
        bossPercentLabel: '75.0%',
        bossKilled: false,
        enemyCount: 1,
        defeatedEnemyCount: 0,
        pullOutcome: 'live',
        pullOutcomeLabel: 'Live',
      },
    ],
  }
}

function combatDataEvent() {
  return {
    type: 'CombatData',
    isActive: 'true',
    Encounter: {
      title: 'Mock Trial',
      duration: '00:02',
      DURATION: '2',
      ENCDPS: '137500',
      ENCHPS: '0',
      DTRPS: '6000',
      damage: '275000',
    },
    Combatant: {
      'Tester McTestface': {
        name: 'Tester McTestface',
        Job: 'WAR',
        encdps: '90000',
        damage: '180000',
        damageperc: '65',
        'damage%': '65',
        deaths: '0',
        crithit: '33',
        'crithit%': '33',
        DirectHitPct: '17',
        tohit: '6',
        enchps: '0',
        rdps: '93000',
        maxhit: 'Heavy Swing-42000',
      },
      'Partner Example': {
        name: 'Partner Example',
        Job: 'BRD',
        encdps: '47500',
        damage: '95000',
        damageperc: '35',
        'damage%': '35',
        deaths: '0',
        crithit: '25',
        'crithit%': '25',
        DirectHitPct: '25',
        tohit: '4',
        enchps: '0',
        rdps: '47000',
        maxhit: 'Burst Shot-30000',
      },
    },
  }
}

async function dispatchOverlayData(page: Page) {
  await page.evaluate(event => {
    const primaryEvent = new CustomEvent('onChangePrimaryPlayer', {
      detail: { type: 'ChangePrimaryPlayer', charID: 1, charName: 'Tester McTestface' },
    })
    const partyEvent = new CustomEvent('onPartyChanged', {
      detail: {
        type: 'PartyChanged',
        party: [
          { id: 1, name: 'Tester McTestface', worldId: 73, job: 'WAR', inParty: true, partyType: 'Party' },
          { id: 2, name: 'Partner Example', worldId: 73, job: 'BRD', inParty: true, partyType: 'Party' },
        ],
      },
    })
    const combatEvent = new CustomEvent('onOverlayDataUpdate', { detail: event })
    for (const target of [window, document]) {
      target.dispatchEvent(primaryEvent)
      target.dispatchEvent(partyEvent)
      target.dispatchEvent(combatEvent)
    }
  }, combatDataEvent())
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
        type: 'ChangePrimaryPlayer',
        charID: 1,
        charName: 'Tester McTestface',
      }))
      listeners.get('PartyChanged')?.forEach(callback => callback({
        type: 'PartyChanged',
        party: [
          { id: 1, name: 'Tester McTestface', worldId: 73, job: 'WAR', inParty: true, partyType: 'Party' },
          { id: 2, name: 'Partner Example', worldId: 73, job: 'BRD', inParty: true, partyType: 'Party' },
        ],
      }))
      listeners.get('CombatData')?.forEach(callback => callback(event))
    }
  }, combatDataEvent())
}

async function expectNoConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('Failed to load resource')) return
    errors.push(text)
  })
  page.on('pageerror', error => errors.push(error.message))
  return errors
}

async function expectNonEmptyScreenshot(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(50)
  expect(box?.height ?? 0).toBeGreaterThan(50)
  const image = await locator.screenshot({ animations: 'disabled' })
  expect(image.length).toBeGreaterThan(1_000)
}

test('editor renders the preview and primary controls', async ({ page }) => {
  const errors = await expectNoConsoleErrors(page)

  await page.goto(`${EDITOR_URL}/#/editor`)

  await expect(page.getByText('Flexi Studio')).toBeVisible()
  await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible()
  await expect(page.locator('.preview-meter')).toBeVisible()
  await expectNonEmptyScreenshot(page.locator('.preview-meter'))
  expect(errors).toEqual([])
})

test('overlay renders the standalone shell', async ({ page }) => {
  const errors = await expectNoConsoleErrors(page)

  await page.goto(OVERLAY_URL)
  await expect(page.locator('.meter-root')).toBeVisible()
  await expect(page.locator('.meter-root')).toContainText('Waiting for combat data')
  await expectNonEmptyScreenshot(page.locator('.meter-root'))
  expect(errors).toEqual([])
})

test('breakdown popout renders seeded encounter data', async ({ page }) => {
  const errors = await expectNoConsoleErrors(page)

  const breakdownPage = await page.context().newPage()
  const breakdownErrors = await expectNoConsoleErrors(breakdownPage)
  await breakdownPage.goto(`${OVERLAY_URL}/?breakdown=1`)

  await expect(breakdownPage.getByText('Flexi Breakdown')).toBeVisible()
  await breakdownPage.evaluate(snapshot => {
    localStorage.setItem('flexi-breakdown-snapshot', JSON.stringify(snapshot))
  }, breakdownSnapshot())
  await breakdownPage.reload()
  await expect(breakdownPage.getByText('Flexi Breakdown')).toBeVisible()

  await expect(breakdownPage.getByText('Mock Trial').first()).toBeVisible()
  await expect(breakdownPage.getByText('Tester McTestface').first()).toBeVisible()
  await expect(breakdownPage.getByText('Heavy Swing').first()).toBeVisible()
  await expectNonEmptyScreenshot(breakdownPage.locator('.bp-root'))
  expect([...errors, ...breakdownErrors]).toEqual([])
})
