import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createLocalStorageMock() {
  const store = new Map<string, string>()
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

class TestCustomEvent<T = unknown> extends Event {
  detail: T

  constructor(type: string, init: { detail: T }) {
    super(type)
    this.detail = init.detail
  }
}

function installBrowserGlobals(search = '') {
  const win = new EventTarget() as Window & typeof globalThis & Record<string, unknown>
  Object.assign(win, {
    location: { search },
    setInterval,
    clearInterval,
  })
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', new EventTarget())
  vi.stubGlobal('CustomEvent', TestCustomEvent)
  vi.stubGlobal('localStorage', createLocalStorageMock())
  return win
}

async function loadOverlayBridge(search = '') {
  vi.resetModules()
  const win = installBrowserGlobals(search)
  const mod = await import('../overlayBridge')
  return { ...mod, win }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('overlayBridge modern mode', () => {
  it('delegates listeners, event startup, and handler calls to modern OverlayPlugin APIs', async () => {
    const { addListener, removeListener, startEvents, callHandler, win } = await loadOverlayBridge()
    const callback = vi.fn()
    const addOverlayListener = vi.fn()
    const removeOverlayListener = vi.fn()
    const startOverlayEvents = vi.fn()
    const callOverlayHandler = vi.fn().mockResolvedValue({ ok: true })
    Object.assign(win, {
      addOverlayListener,
      removeOverlayListener,
      startOverlayEvents,
      callOverlayHandler,
    })

    addListener('CombatData', callback)
    removeListener('CombatData', callback)
    startEvents()
    await expect(callHandler({ call: 'getCombatants' })).resolves.toEqual({ ok: true })

    expect(addOverlayListener).toHaveBeenCalledWith('CombatData', callback)
    expect(removeOverlayListener).toHaveBeenCalledWith('CombatData', callback)
    expect(startOverlayEvents).toHaveBeenCalledOnce()
    expect(callOverlayHandler).toHaveBeenCalledWith({ call: 'getCombatants' })
  })

  it('treats a real OVERLAY_WS query parameter as modern mode', async () => {
    const { addListener, win } = await loadOverlayBridge('?OVERLAY_WS=ws://localhost:10501/ws')
    const addOverlayListener = vi.fn()
    Object.assign(win, { addOverlayListener })

    const callback = vi.fn()
    addListener('ChangeZone', callback)

    expect(addOverlayListener).toHaveBeenCalledWith('ChangeZone', callback)
  })
})

describe('overlayBridge legacy mode', () => {
  it('routes legacy DOM events to registered callbacks', async () => {
    const { addListener, win } = await loadOverlayBridge()
    Object.assign(win, {
      OverlayPluginApi: {
        ready: true,
        callHandler: vi.fn(),
      },
    })
    const callback = vi.fn()

    addListener('CombatData', callback)
    document.dispatchEvent(new CustomEvent('onOverlayDataUpdate', {
      detail: { type: 'CombatData', Encounter: {}, Combatant: {}, isActive: 'true' },
    }))

    expect(callback).toHaveBeenCalledWith({
      type: 'CombatData',
      Encounter: {},
      Combatant: {},
      isActive: 'true',
    })
  })

  it('serializes legacy callHandler requests and parses callback JSON', async () => {
    const { callHandler, win } = await loadOverlayBridge()
    const legacyCallHandler = vi.fn((_json: string, cb?: (result: string) => void) => {
      cb?.('{"status":"ok"}')
    })
    Object.assign(win, {
      OverlayPluginApi: {
        ready: true,
        callHandler: legacyCallHandler,
      },
    })

    await expect(callHandler({ call: 'saveData', key: 'profile' })).resolves.toEqual({ status: 'ok' })
    expect(legacyCallHandler).toHaveBeenCalledWith(
      JSON.stringify({ call: 'saveData', key: 'profile' }),
      expect.any(Function),
    )
  })
})

describe('overlayBridge mock mode', () => {
  it('saves and loads data through localStorage in mock mode', async () => {
    const { callHandler, setMockStateGetter } = await loadOverlayBridge()
    setMockStateGetter(() => true)

    await expect(callHandler({ call: 'saveData', key: 'profile', data: '{"ok":true}' }))
      .resolves.toEqual({ status: 'ok' })
    await expect(callHandler({ call: 'loadData', key: 'profile' }))
      .resolves.toEqual({ data: '{"ok":true}' })
  })

  it('emits mock startup events and stops its polling interval', async () => {
    const { addListener, setMockStateGetter, startEvents, stopEvents } = await loadOverlayBridge()
    setMockStateGetter(() => true)
    const zones = vi.fn()
    const combat = vi.fn()
    addListener('ChangeZone', zones)
    addListener('CombatData', combat)

    startEvents()
    vi.advanceTimersByTime(1000)
    stopEvents()
    vi.advanceTimersByTime(1000)

    expect(zones).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ChangeZone',
      zoneName: 'The Omega Protocol (Ultimate)',
    }))
    expect(combat).toHaveBeenCalledTimes(2)
  })
})
