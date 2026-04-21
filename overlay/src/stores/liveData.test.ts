import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

type ListenerMap = Record<string, (event: any) => void>

const mocks = vi.hoisted(() => ({
  listeners: {} as ListenerMap,
  callHandler: vi.fn(),
  overlayConfig: {
    profile: null as any,
    loaded: false,
    load: vi.fn(),
    applyConfig: vi.fn(),
  },
}))

vi.mock('@shared', () => {
  const DEFAULT_PROFILE = {
    name: 'Default',
    default: {},
    overrides: {},
    tabs: [],
    global: {
      opacity: 1,
      outOfCombat: 'show',
      outOfCombatOpacity: 0.35,
      pets: {},
      mergePets: true,
      combatantFilter: 'all',
      selfOnly: false,
      partyOnly: false,
      sortBy: 'encdps',
      maxCombatants: 8,
      dpsType: 'encdps',
      valueFormat: 'raw',
      transitionDuration: 0,
      blurNames: false,
      header: { pinned: false },
    },
  }

  function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T
  }

  function deepMerge<T extends object>(target: T, source: Partial<T>): T {
    for (const [key, value] of Object.entries(source) as Array<[keyof T, T[keyof T]]>) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        deepMerge(target[key] as object, value as object)
      } else if (value !== undefined) {
        target[key] = value
      }
    }
    return target
  }

  class TransitionEngine {
    private readonly onFrame: (frame: unknown) => void

    constructor(onFrame: (frame: unknown) => void) {
      this.onFrame = onFrame
    }

    setDuration() {}
    stop() {}
    push(frame: unknown) {
      this.onFrame(frame)
    }
  }

  return {
    addListener: vi.fn((event: string, callback: (data: unknown) => void) => {
      mocks.listeners[event] = callback
    }),
    removeListener: vi.fn((event: string) => {
      delete mocks.listeners[event]
    }),
    startEvents: vi.fn(),
    callHandler: mocks.callHandler,
    resolvePets: vi.fn((combatants: Record<string, Record<string, string>>) => ({
      combatants: Object.values(combatants),
    })),
    TransitionEngine,
    DEFAULT_PROFILE,
    deepClone,
    deepMerge,
    RAID_BUFFS: {},
    isProfileLike: vi.fn((value: unknown) => !!value && typeof value === 'object'),
    parseProfileSafe: vi.fn((json: string) => {
      try { return JSON.parse(json) } catch { return null }
    }),
    TIMELINE_BUCKET_SEC: 3,
    formatValue: vi.fn((value: number) => String(Math.round(value))),
  }
})

vi.mock('./overlayConfig', () => ({
  useOverlayConfig: () => mocks.overlayConfig,
}))

function createLocalStorageMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
  }
}

async function createStore() {
  vi.resetModules()
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', createLocalStorageMock())
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  vi.stubGlobal('document', {
    documentElement: { style: { opacity: '' } },
  })
  const { useLiveDataStore } = await import('./liveData')
  return useLiveDataStore()
}

function combatData(active: boolean, combatants: Record<string, Record<string, string>>) {
  return {
    type: 'CombatData',
    isActive: active ? 'true' : 'false',
    Encounter: {
      title: 'Test Encounter',
      duration: '00:30',
      DURATION: '30',
      ENCDPS: '3000',
      ENCHPS: '1200',
      DTRPS: '100',
    },
    Combatant: combatants,
  }
}

function logLine(parts: Record<number, string>): { type: 'LogLine'; rawLine: string; line: string[] } {
  const line = Array(49).fill('')
  for (const [index, value] of Object.entries(parts)) {
    line[Number(index)] = value
  }
  return {
    type: 'LogLine',
    rawLine: line.join('|'),
    line,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.listeners = {}
  mocks.callHandler.mockReset().mockResolvedValue({})
  mocks.overlayConfig.profile = null
  mocks.overlayConfig.loaded = false
  mocks.overlayConfig.load.mockReset().mockResolvedValue(undefined)
  mocks.overlayConfig.applyConfig.mockReset()
})

describe('overlay liveData store', () => {
  it('builds live frames from CombatData and respects the self combatant filter', async () => {
    const store = await createStore()
    store.start()
    mocks.listeners.ChangePrimaryPlayer({ type: 'ChangePrimaryPlayer', charName: 'Alice' })
    store.setCombatantFilter('self')

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '33', deaths: '0' },
      Bob: { name: 'Bob', Job: 'DRG', encdps: '2000', damage: '60000', damageperc: '67', deaths: '0' },
    }))

    expect(store.frame?.encounterTitle).toBe('Test Encounter')
    expect(store.frame?.bars).toHaveLength(1)
    expect(store.frame?.bars[0]).toMatchObject({
      name: 'Alice',
      job: 'WAR',
      displayValue: '1000',
      rank: 1,
    })
    expect(document.documentElement.style.opacity).toBe('1')

    store.stop()
  })

  it('stashes inactive pulls once per encounter duration and restores them with viewPull', async () => {
    const store = await createStore()
    store.start()
    const inactiveEvent = combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    })

    mocks.listeners.CombatData(inactiveEvent)
    mocks.listeners.CombatData(inactiveEvent)

    expect(store.sessionPulls).toHaveLength(1)
    expect(mocks.callHandler).toHaveBeenCalledWith({
      call: 'saveData',
      key: 'act-flexi-pulls',
      data: expect.stringContaining('Test Encounter'),
    })

    store.viewPull(0)

    expect(store.viewingPull).toBe(0)
    expect(store.frame?.encounterTitle).toBe('Test Encounter')
    expect(store.frame?.bars[0]).toMatchObject({
      name: 'Alice',
      displayValue: '1000',
    })

    store.stop()
  })

  it('counts first-seen self heals in healing received even when the heal tops the player', async () => {
    const store = await createStore()
    store.start()
    mocks.listeners.ChangePrimaryPlayer({ type: 'ChangePrimaryPlayer', charName: 'Alice' })

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '1D55',
      5: 'Equilibrium',
      6: '10AAAAAA',
      7: 'Alice',
      8: '04',
      9: '13880000',
      24: '10000',
      25: '10000',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    expect(store.sessionPulls[0].healingReceivedData?.Alice?.['1D55']).toMatchObject({
      abilityName: 'Equilibrium',
      totalDamage: 5000,
      hits: 1,
      sources: {
        Alice: { total: 5000, hits: 1 },
      },
    })

    store.stop()
  })

  it('records outgoing damage targets for the Done targets pivot', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '40000001',
      7: 'Training Boss',
      8: '03',
      9: '27100000',
      24: '75000',
      25: '100000',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    expect(store.sessionPulls[0].abilityData?.Alice?.['0001']).toMatchObject({
      abilityName: 'Heavy Swing',
      totalDamage: 10000,
      targets: {
        'Training Boss': { total: 10000, hits: 1 },
      },
    })

    store.stop()
  })

  it('attributes extra self-heal action effects to active Bloodwhetting', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '26',
      2: 'A76',
      3: 'Bloodwhetting',
      4: '8.00',
      5: '10AAAAAA',
      6: 'Alice',
      7: '10AAAAAA',
      8: 'Alice',
    }))
    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '404E',
      5: 'Mythril Tempest',
      6: '40000001',
      7: 'Training Boss',
      8: '03',
      9: '27100000',
      10: '04',
      11: '13880000',
      24: '75000',
      25: '100000',
      34: '9000',
      35: '10000',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    expect(store.sessionPulls[0].healingReceivedData?.Alice?.['effect:A76']).toMatchObject({
      abilityName: 'Bloodwhetting',
      totalDamage: 5000,
      hits: 1,
      sources: {
        Alice: { total: 5000, hits: 1 },
      },
    })

    store.stop()
  })

  it('populates enemy resource samples from damage log target HP for Boss HP progress', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '40000001',
      7: 'Training Boss',
      8: '03',
      9: '27100000',
      24: '75000',
      25: '100000',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    expect(store.sessionPulls[0].combatantIds?.['Training Boss']).toBe('40000001')
    expect(store.sessionPulls[0].resourceData?.['Training Boss']?.at(-1)).toMatchObject({
      currentHp: 75000,
      maxHp: 100000,
      hp: 0.75,
    })

    store.stop()
  })

  it('persists enemy deaths from NetworkDeath lines for kill detection', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '40000001',
      7: 'Training Boss',
      8: '03',
      9: '27100000',
      24: '75000',
      25: '100000',
    }))
    mocks.listeners.LogLine(logLine({
      0: '25',
      2: '40000001',
      3: 'Training Boss',
      4: '10AAAAAA',
      5: 'Alice',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    expect(store.sessionPulls[0].enemyDeaths?.['Training Boss']).toBe(0)
    expect(store.sessionPulls[0].resourceData?.['Training Boss']?.at(-1)).toMatchObject({
      currentHp: 0,
      maxHp: 100000,
      hp: 0,
    })

    store.stop()
  })

  it('marks multi-enemy pulls as wipe when only an add is defeated', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '40000001',
      7: 'Training Boss',
      8: '03',
      9: '27100000',
      24: '50000',
      25: '100000',
    }))
    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0002',
      5: 'Tomahawk',
      6: '40000002',
      7: 'Training Add',
      8: '03',
      9: '03E80000',
      24: '0',
      25: '10000',
    }))
    mocks.listeners.LogLine(logLine({
      0: '25',
      2: '40000002',
      3: 'Training Add',
      4: '10AAAAAA',
      5: 'Alice',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const historicalPull = payload.pullList.find((entry: { index: number | null }) => entry.index === 0)

    expect(historicalPull).toMatchObject({
      pullOutcome: 'wipe',
      pullOutcomeLabel: 'Wipe',
      bossKilled: false,
      enemyCount: 2,
      defeatedEnemyCount: 1,
    })
    expect(historicalPull.bossPercentLabel).toContain('50.0% Training Boss')
    expect(historicalPull.bossPercentLabel).toContain('1/2 defeated')

    store.stop()
  })
})
