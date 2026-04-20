import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

type ListenerMap = Record<string, (event: any) => void>

const mocks = vi.hoisted(() => ({
  listeners: {} as ListenerMap,
  setMockStateGetter: vi.fn(),
  startEvents: vi.fn(),
  stopEvents: vi.fn(),
}))

vi.mock('@shared/index', () => {
  class TransitionEngine {
    private readonly onFrame: (frame: unknown) => void
    duration = 0
    stopped = false

    constructor(onFrame: (frame: unknown) => void) {
      this.onFrame = onFrame
    }

    setDuration(duration: number) {
      this.duration = duration
    }

    push(frame: unknown) {
      this.onFrame(frame)
    }

    stop() {
      this.stopped = true
    }
  }

  return {
    addListener: vi.fn((event: string, callback: (data: unknown) => void) => {
      mocks.listeners[event] = callback
    }),
    removeListener: vi.fn((event: string) => {
      delete mocks.listeners[event]
    }),
    startEvents: mocks.startEvents,
    stopEvents: mocks.stopEvents,
    setMockStateGetter: mocks.setMockStateGetter,
    TransitionEngine,
    DEFAULT_PROFILE: {
      name: 'Default',
      default: {},
      overrides: {},
      global: {
        pets: {},
        combatantFilter: 'all',
        selfOnly: false,
        partyOnly: false,
        sortBy: 'encdps',
        dpsType: 'encdps',
        maxCombatants: 8,
        valueFormat: 'raw',
        transitionDuration: 0,
      },
    },
    deepClone: <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T,
    resolvePets: vi.fn((combatants: Record<string, Record<string, string>>) => ({
      combatants: Object.values(combatants),
    })),
  }
})

async function createStore(now = 100) {
  vi.resetModules()
  setActivePinia(createPinia())
  vi.stubGlobal('performance', { now: vi.fn(() => now) })
  const { useLiveDataStore } = await import('./liveData')
  return useLiveDataStore()
}

function combatData(active: boolean, combatants: Record<string, Record<string, string>>) {
  return {
    type: 'CombatData',
    isActive: active ? 'true' : 'false',
    Encounter: {
      title: 'Preview Encounter',
      duration: '00:42',
      ENCDPS: '3000',
      ENCHPS: '1200',
      DTRPS: '100',
      RDPS: '3100',
    },
    Combatant: combatants,
  }
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Preview',
    default: {},
    overrides: { byRole: {}, byJob: {} },
    global: {
      pets: {},
      combatantFilter: 'all',
      selfOnly: false,
      partyOnly: false,
      sortBy: 'encdps',
      dpsType: 'encdps',
      maxCombatants: 8,
      valueFormat: 'raw',
      transitionDuration: 0,
      ...overrides,
    },
  } as any
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.listeners = {}
  mocks.setMockStateGetter.mockReset()
  mocks.startEvents.mockReset()
  mocks.stopEvents.mockReset()
})

describe('editor liveData store', () => {
  it('registers mock overlay listeners on start and removes them on stop', async () => {
    const store = await createStore()

    store.start()

    expect(mocks.setMockStateGetter).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.setMockStateGetter.mock.calls[0][0]()).toBe(true)
    expect(Object.keys(mocks.listeners).sort()).toEqual(['ChangePrimaryPlayer', 'CombatData', 'PartyChanged'])
    expect(mocks.startEvents).toHaveBeenCalledOnce()

    store.stop()

    expect(mocks.listeners).toEqual({})
    expect(mocks.stopEvents).toHaveBeenCalledOnce()
  })

  it('builds sorted preview frames and applies self filtering', async () => {
    const store = await createStore()
    store.setProfileGetter(() => profile({ combatantFilter: 'self' }))
    store.start()
    mocks.listeners.ChangePrimaryPlayer({ type: 'ChangePrimaryPlayer', charName: 'Alice' })

    mocks.listeners.CombatData(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000', enchps: '10', rdps: '900', deaths: '1', maxhit: 'Hit-123' },
      Bob: { name: 'Bob', Job: 'DRG', encdps: '2000', enchps: '20', rdps: '1900', deaths: '0', maxhit: 'Hit-456' },
    }))

    expect(store.isActive).toBe(true)
    expect(store.frame?.encounterTitle).toBe('Preview Encounter')
    expect(store.frame?.bars).toHaveLength(1)
    expect(store.frame?.bars[0]).toMatchObject({
      name: 'Alice',
      job: 'WAR',
      displayValue: '1000',
      fillFraction: 1,
      deaths: '1',
      maxHit: 'Hit 123',
    })
  })

  it('uses party filtering and max combatant limits', async () => {
    const store = await createStore()
    store.setProfileGetter(() => profile({ combatantFilter: 'party', maxCombatants: 1 }))
    store.start()
    mocks.listeners.PartyChanged({
      type: 'PartyChanged',
      party: [{ name: 'Bob' }],
    })

    mocks.listeners.CombatData(combatData(false, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '3000' },
      Bob: { name: 'Bob', Job: 'DRG', encdps: '2000' },
      Cara: { name: 'Cara', Job: 'WHM', encdps: '1000' },
    }))

    expect(store.isActive).toBe(false)
    expect(store.frame?.bars.map(bar => bar.name)).toEqual(['Bob'])
  })

  it('throttles rapid frame updates to roughly 30fps', async () => {
    const store = await createStore(10)

    store.buildFrame(combatData(true, {
      Alice: { name: 'Alice', Job: 'WAR', encdps: '1000' },
    }) as any, profile())

    expect(store.frame).toBeNull()
  })
})
