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

  function allocatePercentageBuffDamage(
    damage: number,
    windows: Array<{ sourceName: string; multiplier: number }>,
  ) {
    if (!Number.isFinite(damage) || damage <= 0) return []
    const eligible = windows.filter(window => window.sourceName && window.multiplier > 1)
    if (eligible.length === 0) return []
    const totalMultiplier = eligible.reduce((product, window) => product * window.multiplier, 1)
    const buffDamage = damage - damage / totalMultiplier
    const totalLog = Math.log(totalMultiplier)
    const bySource = new Map<string, number>()
    for (const window of eligible) {
      const weight = Math.log(window.multiplier) / totalLog
      bySource.set(window.sourceName, (bySource.get(window.sourceName) ?? 0) + buffDamage * weight)
    }
    return Array.from(bySource, ([sourceName, amount]) => ({ sourceName, amount }))
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
    resolvePets: vi.fn((combatants: Record<string, Record<string, string>>, opts?: { show?: boolean; mergeWithOwner?: boolean }) => {
      const values = Object.values(combatants)
      const isPet = (name: string) => /\(.+\)$/.test(name)
      if (opts?.mergeWithOwner) {
        const merged = values.filter(c => !isPet(c.name)).map(c => ({ ...c }))
        for (const pet of values.filter(c => isPet(c.name))) {
          const ownerName = pet.name.match(/\((.+)\)$/)?.[1]
          const owner = merged.find(c => c.name === ownerName)
          if (!owner) continue
          owner.damage = String((parseFloat(owner.damage ?? '0') || 0) + (parseFloat(pet.damage ?? '0') || 0))
          owner.encdps = String((parseFloat(owner.encdps ?? '0') || 0) + (parseFloat(pet.encdps ?? '0') || 0))
        }
        return { combatants: merged }
      }
      return {
        combatants: opts?.show ? values : values.filter(c => !isPet(c.name)),
      }
    }),
    TransitionEngine,
    DEFAULT_PROFILE,
    deepClone,
    deepMerge,
    allocatePercentageBuffDamage,
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

  it('does not reset log-derived data for transient zero-duration active packets in the same pull', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData({
      ...combatData(true, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '300000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(true, {}).Encounter,
        duration: '05:00',
        DURATION: '300',
      },
    })

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

    mocks.listeners.CombatData({
      ...combatData(true, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '950', damage: '300000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(true, {}).Encounter,
        duration: '',
        DURATION: '0',
      },
    })

    mocks.listeners.CombatData({
      ...combatData(false, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '950', damage: '315000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(false, {}).Encounter,
        duration: '05:15',
        DURATION: '315',
      },
    })

    expect(store.sessionPulls[0].abilityData?.Alice?.['0001']).toMatchObject({
      abilityName: 'Heavy Swing',
      totalDamage: 10000,
    })

    store.stop()
  })

  it('keeps the same pull when Enuo reappears with a new network id after downtime', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData({
      ...combatData(true, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '300000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(true, {}).Encounter,
        duration: '02:00',
        DURATION: '120',
      },
    })

    mocks.listeners.LogLine(logLine({
      0: '21',
      1: '2026-05-01T12:00:00.0000000-06:00',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '400043AE',
      7: 'Enuo',
      8: '03',
      9: '27100000',
      24: '88831771',
      25: '107935443',
    }))
    mocks.listeners.LogLine(logLine({
      0: '21',
      1: '2026-05-01T12:00:20.4990000-06:00',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '4000485D',
      7: 'Enuo',
      8: '03',
      9: '27100000',
      24: '107935443',
      25: '107935443',
    }))

    mocks.listeners.CombatData({
      ...combatData(false, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '300000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(false, {}).Encounter,
        duration: '02:30',
        DURATION: '150',
      },
    })

    expect(store.sessionPulls[0].abilityData?.Alice?.['0001']).toMatchObject({
      abilityName: 'Heavy Swing',
      totalDamage: 20000,
      hits: 2,
    })

    store.stop()
  })

  it('parses formatted encounter durations when calculating historical rdps', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData({
      ...combatData(false, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '100', damage: '360000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(false, {}).Encounter,
        duration: '01:00:00',
        DURATION: '01:00:00',
      },
    })

    expect(store.sessionPulls[0].combatants[0].rdps).toBe('100')

    store.stop()
  })

  it('keeps unmerged pet combatants available for historical breakdown metrics', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData({
      ...combatData(false, {
        Alice: { name: 'Alice', Job: 'SMN', encdps: '1000', damage: '60000', damageperc: '92', deaths: '0' },
        'Carbuncle(Alice)': { name: 'Carbuncle(Alice)', Job: '', encdps: '100', damage: '6000', damageperc: '8', deaths: '0' },
      }),
      Encounter: {
        ...combatData(false, {}).Encounter,
        duration: '01:00',
        DURATION: '60',
      },
    })

    store.viewPull(0)
    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')

    expect(payload.damageByCombatant).toMatchObject({
      Alice: 60000,
      'Carbuncle(Alice)': 6000,
    })

    store.stop()
  })

  it('starts a fresh enemy snapshot when logs for a different encounter arrive after a stashed pull', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData({
      ...combatData(true, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(true, {}).Encounter,
        title: 'Mistwake Rock',
        duration: '00:44',
        DURATION: '44',
      },
    })
    mocks.listeners.LogLine(logLine({
      0: '21',
      1: '2026-05-01T12:00:00.0000000-06:00',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '40000001',
      7: 'Thancres Avatar',
      8: '03',
      9: '27100000',
      24: '0',
      25: '1000000',
    }))
    mocks.listeners.LogLine(logLine({
      0: '25',
      1: '2026-05-01T12:00:01.0000000-06:00',
      2: '40000001',
      3: 'Thancres Avatar',
    }))
    mocks.listeners.CombatData({
      ...combatData(false, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(false, {}).Encounter,
        title: 'Mistwake Rock',
        duration: '00:44',
        DURATION: '44',
      },
    })

    mocks.listeners.LogLine(logLine({
      0: '21',
      1: '2026-05-01T12:01:00.0000000-06:00',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '40000002',
      7: 'Amdusias',
      8: '03',
      9: '27100000',
      24: '0',
      25: '1000000',
    }))
    mocks.listeners.LogLine(logLine({
      0: '25',
      1: '2026-05-01T12:01:01.0000000-06:00',
      2: '40000002',
      3: 'Amdusias',
    }))
    mocks.listeners.CombatData({
      ...combatData(false, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(false, {}).Encounter,
        title: 'Amdusias',
        duration: '02:38',
        DURATION: '158',
      },
    })

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const amdusias = payload.pullList.find((entry: { encounterName: string }) => entry.encounterName === 'Amdusias')

    expect(amdusias).toMatchObject({
      primaryEnemyName: 'Amdusias',
      enemyCount: 1,
      defeatedEnemyCount: 1,
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
      totalDamage: 0,
      overheal: 5000,
      hits: 1,
      sources: {
        Alice: { total: 0, overheal: 5000, hits: 1 },
      },
    })

    store.stop()
  })

  it('splits incoming healing into effective healing and overheal', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      Bob: { name: 'Bob', Job: 'WHM', encdps: '0', damage: '0', damageperc: '0', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '40000001',
      3: 'Training Boss',
      4: '0001',
      5: 'Raidwide',
      6: '10AAAAAA',
      7: 'Alice',
      8: '03',
      9: '3E800000',
      24: '6000',
      25: '10000',
    }))
    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10BBBBBB',
      3: 'Bob',
      4: '0BB8',
      5: 'Cure',
      6: '10AAAAAA',
      7: 'Alice',
      8: '04',
      9: '13880000',
      24: '9000',
      25: '10000',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      Bob: { name: 'Bob', Job: 'WHM', encdps: '0', damage: '0', damageperc: '0', deaths: '0' },
    }))

    expect(store.sessionPulls[0].healingReceivedData?.Alice?.['0BB8']).toMatchObject({
      abilityName: 'Cure',
      totalDamage: 3000,
      overheal: 2000,
      hits: 1,
      sources: {
        Bob: { total: 3000, overheal: 2000, hits: 1 },
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

  it('uses raw live timelines for pull list DPS and primary enemy instead of formatted frame totals', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData({
      ...combatData(true, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(true, {}).Encounter,
        ENCDPS: '96',
      },
    })

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '10AAAAAA',
      3: 'Alice',
      4: '0001',
      5: 'Heavy Swing',
      6: '40000001',
      7: 'Training Boss',
      8: '03',
      9: '75300000',
      24: '70000',
      25: '100000',
    }))

    mocks.listeners.CombatData({
      ...combatData(true, {
        Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      }),
      Encounter: {
        ...combatData(true, {}).Encounter,
        ENCDPS: '96',
      },
    })

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const livePull = payload.pullList.find((entry: { index: number | null }) => entry.index === null)

    expect(livePull).toMatchObject({
      dps: 1000,
      rdps: 1000,
      primaryEnemyName: 'Training Boss',
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

  it('marks same-name multi-enemy packs as clear when the stale first-seen id has no remaining HP', async () => {
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
      7: 'Training Add',
      8: '03',
      9: '03E80000',
      24: '5000',
      25: '10000',
    }))
    for (const [id, name] of [
      ['40000002', 'Training Add'],
      ['40000003', 'Training Sentry'],
      ['40000004', 'Training Guard'],
      ['40000005', 'Training Mage'],
    ]) {
      mocks.listeners.LogLine(logLine({
        0: '21',
        2: '10AAAAAA',
        3: 'Alice',
        4: '0002',
        5: 'Tomahawk',
        6: id,
        7: name,
        8: '03',
        9: '03E80000',
        24: '0',
        25: '10000',
      }))
      mocks.listeners.LogLine(logLine({
        0: '25',
        2: id,
        3: name,
        4: '10AAAAAA',
        5: 'Alice',
      }))
    }

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const historicalPull = payload.pullList.find((entry: { index: number | null }) => entry.index === 0)

    expect(historicalPull).toMatchObject({
      pullOutcome: 'clear',
      pullOutcomeLabel: 'Clear',
      bossKilled: true,
      enemyCount: 4,
      defeatedEnemyCount: 4,
    })
    expect(historicalPull.bossPercentLabel).toContain('Cleared')
    expect(historicalPull.bossPercentLabel).toContain('4/4 defeated')

    store.stop()
  })

  it('ignores one HP objective candidates when no death line arrives', async () => {
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
      5: 'Tomahawk',
      6: '40000001',
      7: 'Training Spirit',
      8: '03',
      9: '03E80000',
      24: '1',
      25: '10000',
    }))

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
    }))

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const historicalPull = payload.pullList.find((entry: { index: number | null }) => entry.index === 0)

    expect(historicalPull).toMatchObject({
      pullOutcome: 'unknown',
      pullOutcomeLabel: 'Unknown',
    })
    expect(historicalPull.enemyCount).toBeUndefined()
    expect(historicalPull.defeatedEnemyCount).toBeUndefined()
    expect(historicalPull.bossPercentLabel).toBeUndefined()

    store.stop()
  })

  it('excludes Trust avatars from defeated enemy objective counts', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      "Thancred's Avatar": { name: "Thancred's Avatar", Job: '', encdps: '100', damage: '3000', damageperc: '10', deaths: '0' },
    }))

    mocks.listeners.LogLine(logLine({
      0: '21',
      2: '40000AAA',
      3: 'Training Add',
      4: '0001',
      5: 'attack',
      6: '40000BAD',
      7: "Thancred's Avatar",
      8: '03',
      9: '03E80000',
      24: '90000',
      25: '100000',
      34: '10000',
      35: '10000',
    }))

    for (const id of ['40000001', '40000002', '40000003', '40000004']) {
      mocks.listeners.LogLine(logLine({
        0: '21',
        2: '10AAAAAA',
        3: 'Alice',
        4: '0002',
        5: 'Tomahawk',
        6: id,
        7: 'Training Add',
        8: '03',
        9: '03E80000',
        24: '0',
        25: '10000',
      }))
      mocks.listeners.LogLine(logLine({
        0: '25',
        2: id,
        3: 'Training Add',
        4: '10AAAAAA',
        5: 'Alice',
      }))
    }

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      "Thancred's Avatar": { name: "Thancred's Avatar", Job: '', encdps: '100', damage: '3000', damageperc: '10', deaths: '0' },
    }))

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const historicalPull = payload.pullList.find((entry: { index: number | null }) => entry.index === 0)

    expect(historicalPull).toMatchObject({
      pullOutcome: 'clear',
      pullOutcomeLabel: 'Clear',
      bossKilled: true,
      enemyCount: 4,
      defeatedEnemyCount: 4,
    })
    expect(historicalPull.bossPercentLabel).toContain('4/4 defeated')
    expect(historicalPull.primaryEnemyName).toBe('Training Add')

    store.stop()
  })

  it('excludes friendly duty NPCs from defeated enemy objective counts', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      'Treno Citizen': { name: 'Treno Citizen', Job: '', encdps: '100', damage: '3000', damageperc: '10', deaths: '0' },
    }))

    for (const [id, name, job] of [
      ['40010001', 'Mistwake Jabberwock', '00'],
      ['40010002', 'Mistwake Jabberwock', '00'],
      ['40010003', 'Mistwake Spirit', '00'],
      ['40010004', 'Treno Citizen', '04'],
      ['40010005', 'Treno Citizen', '1A'],
      ['40010006', 'Treno Citizen', '04'],
      ['40010007', "Thancred's Avatar", '25'],
    ]) {
      mocks.listeners.LogLine(logLine({
        0: '03',
        2: id,
        3: name,
        4: job,
      }))
    }

    for (const [sourceId, sourceName, targetId, targetName] of [
      ['40010004', 'Treno Citizen', '40010001', 'Mistwake Jabberwock'],
      ['40010005', 'Treno Citizen', '40010002', 'Mistwake Jabberwock'],
      ['40010006', 'Treno Citizen', '40010003', 'Mistwake Spirit'],
      ['40010001', 'Mistwake Jabberwock', '40010004', 'Treno Citizen'],
      ['40010002', 'Mistwake Jabberwock', '40010005', 'Treno Citizen'],
      ['40010003', 'Mistwake Spirit', '40010006', 'Treno Citizen'],
    ]) {
      mocks.listeners.LogLine(logLine({
        0: '21',
        2: sourceId,
        3: sourceName,
        4: '0001',
        5: 'attack',
        6: targetId,
        7: targetName,
        8: '03',
        9: '03E80000',
        24: targetName === 'Treno Citizen' ? '90000' : '5000',
        25: targetName === 'Treno Citizen' ? '100000' : '10000',
        34: sourceName === 'Treno Citizen' ? '90000' : '5000',
        35: sourceName === 'Treno Citizen' ? '100000' : '10000',
      }))
    }

    for (const [id, name] of [
      ['40010001', 'Mistwake Jabberwock'],
      ['40010002', 'Mistwake Jabberwock'],
      ['40010003', 'Mistwake Spirit'],
    ]) {
      mocks.listeners.LogLine(logLine({
        0: '21',
        2: '10AAAAAA',
        3: 'Alice',
        4: '0002',
        5: 'Tomahawk',
        6: id,
        7: name,
        8: '03',
        9: '03E80000',
        24: '0',
        25: '10000',
      }))
      mocks.listeners.LogLine(logLine({
        0: '25',
        2: id,
        3: name,
        4: '10AAAAAA',
        5: 'Alice',
      }))
    }

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      'Treno Citizen': { name: 'Treno Citizen', Job: '', encdps: '100', damage: '3000', damageperc: '10', deaths: '0' },
    }))

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const historicalPull = payload.pullList.find((entry: { index: number | null }) => entry.index === 0)

    expect(historicalPull).toMatchObject({
      pullOutcome: 'clear',
      pullOutcomeLabel: 'Clear',
      bossKilled: true,
      enemyCount: 3,
      defeatedEnemyCount: 3,
    })
    expect(historicalPull.bossPercentLabel).toContain('3/3 defeated')
    expect(historicalPull.primaryEnemyName).not.toBe('Treno Citizen')

    store.stop()
  })

  it('uses player damage to identify objectives when add-combatant hints were missed', async () => {
    const store = await createStore()
    store.start()

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      'Treno Citizen': { name: 'Treno Citizen', Job: '', encdps: '100', damage: '3000', damageperc: '10', deaths: '0' },
    }))

    for (const [sourceId, sourceName, targetId, targetName] of [
      ['40010004', 'Treno Citizen', '40010001', 'Mistwake Jabberwock'],
      ['40010005', 'Treno Citizen', '40010002', 'Mistwake Jabberwock'],
      ['40010006', 'Treno Citizen', '40010003', 'Mistwake Spirit'],
      ['40010001', 'Mistwake Jabberwock', '40010004', 'Treno Citizen'],
      ['40010002', 'Mistwake Jabberwock', '40010005', 'Treno Citizen'],
      ['40010003', 'Mistwake Spirit', '40010006', 'Treno Citizen'],
    ]) {
      mocks.listeners.LogLine(logLine({
        0: '21',
        2: sourceId,
        3: sourceName,
        4: '0001',
        5: 'attack',
        6: targetId,
        7: targetName,
        8: '03',
        9: '03E80000',
        24: targetName === 'Treno Citizen' ? '90000' : '5000',
        25: targetName === 'Treno Citizen' ? '100000' : '10000',
        34: sourceName === 'Treno Citizen' ? '90000' : '5000',
        35: sourceName === 'Treno Citizen' ? '100000' : '10000',
      }))
    }

    for (const [id, name] of [
      ['40010001', 'Mistwake Jabberwock'],
      ['40010002', 'Mistwake Jabberwock'],
      ['40010003', 'Mistwake Spirit'],
    ]) {
      mocks.listeners.LogLine(logLine({
        0: '21',
        2: '10AAAAAA',
        3: 'Alice',
        4: '0002',
        5: 'Tomahawk',
        6: id,
        7: name,
        8: '03',
        9: '03E80000',
        24: '0',
        25: '10000',
      }))
      mocks.listeners.LogLine(logLine({
        0: '25',
        2: id,
        3: name,
        4: '10AAAAAA',
        5: 'Alice',
      }))
    }

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', damage: '30000', damageperc: '100', deaths: '0' },
      'Treno Citizen': { name: 'Treno Citizen', Job: '', encdps: '100', damage: '3000', damageperc: '10', deaths: '0' },
    }))

    store.broadcastForCombatant('Alice')
    const payload = JSON.parse(localStorage.getItem('flexi-breakdown-snapshot') ?? '{}')
    const historicalPull = payload.pullList.find((entry: { index: number | null }) => entry.index === 0)

    expect(historicalPull).toMatchObject({
      pullOutcome: 'clear',
      pullOutcomeLabel: 'Clear',
      bossKilled: true,
      enemyCount: 3,
      defeatedEnemyCount: 3,
    })
    expect(historicalPull.bossPercentLabel).toContain('3/3 defeated')
    expect(historicalPull.primaryEnemyName).not.toBe('Treno Citizen')

    store.stop()
  })
})
