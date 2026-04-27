import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_PROFILE } from '@shared/presets'

const mocks = vi.hoisted(() => ({
  loadAllConfiguredFonts: vi.fn(),
}))

vi.mock('@shared/googleFonts', () => ({
  loadAllConfiguredFonts: mocks.loadAllConfiguredFonts,
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

function createLocalStorageMock(
  initial: Record<string, string> = {},
  options: { throwOnSet?: boolean } = {},
) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      if (options.throwOnSet) throw new Error('storage full')
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
  }
}

async function createStore(
  initialStorage: Record<string, string> = {},
  options: { throwOnSet?: boolean } = {},
) {
  vi.resetModules()
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', createLocalStorageMock(initialStorage, options))
  const { useOverlayConfig } = await import('./overlayConfig')
  return useOverlayConfig()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.loadAllConfiguredFonts.mockReset()
})

describe('overlayConfig persistence', () => {
  it('loads a valid saved profile, deep-merges defaults, and loads configured fonts', async () => {
    const store = await createStore({
      'act-flexi-overlay-config': JSON.stringify({
        name: 'Overlay saved',
        global: { opacity: 0.55 },
      }),
    })

    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.profile.name).toBe('Overlay saved')
    expect(store.profile.global.opacity).toBe(0.55)
    expect(store.profile.default).toEqual(DEFAULT_PROFILE.default)
    expect(mocks.loadAllConfiguredFonts).toHaveBeenCalledWith(store.profile)
  })

  it('keeps defaults and warns when saved profile data is corrupt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = await createStore({
      'act-flexi-overlay-config': '{"global":null}',
    })

    await store.load()

    expect(store.loaded).toBe(false)
    expect(store.profile.name).toBe(DEFAULT_PROFILE.name)
    expect(warn).toHaveBeenCalledWith('[overlayConfig] corrupt saved profile, using default')
    expect(mocks.loadAllConfiguredFonts).toHaveBeenCalledWith(store.profile)
  })

  it('applies incoming config, saves it, and loads configured fonts', async () => {
    const store = await createStore()
    const incoming = {
      ...JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
      name: 'Incoming',
      global: {
        ...DEFAULT_PROFILE.global,
        opacity: 0.33,
      },
    }

    store.applyConfig(incoming)

    expect(store.profile).toEqual(incoming)
    expect(mocks.loadAllConfiguredFonts).toHaveBeenCalledWith(incoming)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'act-flexi-overlay-config',
      JSON.stringify(incoming),
    )
  })

  it('swallows localStorage save failures', async () => {
    const store = await createStore({}, { throwOnSet: true })

    expect(() => store.save()).not.toThrow()
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'act-flexi-overlay-config',
      JSON.stringify(store.profile),
    )
  })
})
