import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { DEFAULT_PROFILE } from '@shared/presets'

const mocks = vi.hoisted(() => ({
  callHandler: vi.fn(),
  loadFontBatch: vi.fn(),
}))

vi.mock('@shared/overlayBridge', () => ({
  callHandler: mocks.callHandler,
}))

vi.mock('@shared/googleFonts', () => ({
  loadFontBatch: mocks.loadFontBatch,
}))

vi.mock('@shared/index', () => {
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

  return { deepClone, deepMerge }
})

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

async function createStore(initialStorage: Record<string, string> = {}) {
  vi.resetModules()
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', createLocalStorageMock(initialStorage))
  const { useConfigStore } = await import('./config')
  return useConfigStore()
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.callHandler.mockReset()
  mocks.loadFontBatch.mockReset()
})

describe('editor config persistence', () => {
  it('loads and merges a valid OverlayPlugin profile without marking the store dirty', async () => {
    mocks.callHandler.mockResolvedValue({
      data: JSON.stringify({
        name: 'Overlay profile',
        global: { opacity: 0.42 },
      }),
    })
    const store = await createStore()

    await expect(store.load()).resolves.toBe(true)
    await nextTick()

    expect(store.profile.name).toBe('Overlay profile')
    expect(store.profile.global.opacity).toBe(0.42)
    expect(store.profile.default).toEqual(DEFAULT_PROFILE.default)
    expect(store.dirty).toBe(false)
    expect(mocks.loadFontBatch).toHaveBeenCalledWith(store.profile)
  })

  it('falls back to localStorage when OverlayPlugin loading fails', async () => {
    mocks.callHandler.mockRejectedValue(new Error('OverlayPlugin unavailable'))
    const store = await createStore({
      'act-flexi-profile': JSON.stringify({
        name: 'Local profile',
        global: { valueFormat: 'raw' },
      }),
    })

    await expect(store.load()).resolves.toBe(true)
    await nextTick()

    expect(store.profile.name).toBe('Local profile')
    expect(store.profile.global.valueFormat).toBe('raw')
    expect(store.dirty).toBe(false)
  })

  it('uses localStorage when OverlayPlugin returns malformed profile data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.callHandler.mockResolvedValue({ data: '{"global":null}' })
    const store = await createStore({
      'act-flexi-profile': JSON.stringify({
        name: 'Fallback profile',
        global: { opacity: 0.75 },
      }),
    })

    await expect(store.load()).resolves.toBe(true)

    expect(store.profile.name).toBe('Fallback profile')
    expect(store.profile.global.opacity).toBe(0.75)
    expect(warn).toHaveBeenCalledWith('[config] OverlayPlugin returned malformed profile, trying localStorage')
  })

  it('keeps defaults and returns false when saved profiles are corrupt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.callHandler.mockResolvedValue({ data: '{"global":null}' })
    const store = await createStore({
      'act-flexi-profile': '{not-json',
    })

    await expect(store.load()).resolves.toBe(false)

    expect(store.profile.name).toBe(DEFAULT_PROFILE.name)
    expect(store.dirty).toBe(false)
    expect(warn).toHaveBeenCalledWith('[config] corrupt localStorage profile, using default')
  })

  it('saves through OverlayPlugin and localStorage, then clears dirty state', async () => {
    mocks.callHandler.mockResolvedValue({ status: 'ok' })
    const store = await createStore()

    store.patchGlobal({ opacity: 0.5 })
    await nextTick()
    expect(store.dirty).toBe(true)

    await store.save()

    expect(mocks.callHandler).toHaveBeenCalledWith({
      call: 'saveData',
      key: 'act-flexi-profile',
      data: JSON.stringify(store.profile),
    })
    expect(localStorage.setItem).toHaveBeenCalledWith('act-flexi-profile', JSON.stringify(store.profile))
    expect(store.dirty).toBe(false)
  })
})
