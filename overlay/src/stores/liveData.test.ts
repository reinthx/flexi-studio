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
})
