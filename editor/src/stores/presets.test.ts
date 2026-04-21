import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => ({
  config: {
    profile: {
      name: 'Default',
      global: { opacity: 1 },
      default: {},
      overrides: {},
    },
    applyProfile: vi.fn(),
  },
  decodeShareString: vi.fn(),
  encodeShareString: vi.fn(),
  isShareString: vi.fn(),
}))

vi.mock('./config', () => ({
  useConfigStore: () => mocks.config,
}))

vi.mock('@shared/index', () => ({
  deepClone: <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T,
}))

vi.mock('@shared/profileCodec', () => ({
  decodeShareString: mocks.decodeShareString,
  encodeShareString: mocks.encodeShareString,
  isShareString: mocks.isShareString,
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

async function createStore(initialStorage: Record<string, string> = {}) {
  vi.resetModules()
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', createLocalStorageMock(initialStorage))
  vi.stubGlobal('window', { location: { search: '' } })
  const { usePresetsStore } = await import('./presets')
  return usePresetsStore()
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.config.profile = {
    name: 'Default',
    global: { opacity: 1 },
    default: {},
    overrides: {},
  }
  mocks.config.applyProfile.mockReset()
  mocks.decodeShareString.mockReset()
  mocks.encodeShareString.mockReset()
  mocks.isShareString.mockReset().mockReturnValue(false)
})

describe('presets store custom presets', () => {
  it('adds, updates, renames, and removes custom presets in localStorage', async () => {
    const store = await createStore()

    store.addCustomPreset('First', 'User')
    expect(store.customPresets).toEqual([
      { name: 'First', category: 'User', profile: mocks.config.profile },
    ])
    expect(localStorage.setItem).toHaveBeenLastCalledWith(
      'act-flexi-custom-presets',
      JSON.stringify(store.customPresets),
    )

    mocks.config.profile = {
      ...mocks.config.profile,
      name: 'Changed',
      global: { opacity: 0.5 },
    }
    store.updateCustomPreset(0)
    store.renameCustomPreset(0, 'Renamed')

    expect(store.customPresets[0].name).toBe('Renamed')
    expect(store.customPresets[0].profile.global.opacity).toBe(0.5)

    store.removeCustomPreset(0)
    expect(store.customPresets).toEqual([])
    expect(localStorage.setItem).toHaveBeenLastCalledWith('act-flexi-custom-presets', '[]')
  })

  it('applies custom and built-in presets through the config store', async () => {
    const store = await createStore()
    const builtInProfile = { name: 'Built', global: { opacity: 0.7 }, default: {}, overrides: {} }
    const customProfile = { name: 'Custom', global: { opacity: 0.4 }, default: {}, overrides: {} }
    store.builtInPresets = [{ name: 'Built One', filename: 'built-one', profile: builtInProfile as any }]
    store.customPresets = [{ name: 'Custom One', category: '', profile: customProfile as any }]

    store.applyBuiltIn(0)

    expect(mocks.config.applyProfile).toHaveBeenCalledWith(builtInProfile)
    expect(mocks.config.profile.name).toBe('Built One')
    expect(store.activePresetKey).toBe('builtin:Built One')

    store.applyCustom(0)

    expect(mocks.config.applyProfile).toHaveBeenCalledWith(customProfile)
    expect(mocks.config.profile.name).toBe('Custom One')
    expect(store.activePresetKey).toBe('custom:Custom One')
  })
})

describe('presets store categories', () => {
  it('starts without a default custom category for new storage', async () => {
    const store = await createStore()

    await store.init()

    expect(store.categories).toEqual([])
    expect(localStorage.setItem).not.toHaveBeenCalledWith(
      'act-flexi-preset-categories',
      expect.any(String),
    )
  })

  it('removes the legacy empty User category without hiding assigned User presets', async () => {
    const emptyLegacyStore = await createStore({
      'act-flexi-preset-categories': JSON.stringify([{ name: 'User', collapsed: false }]),
    })

    await emptyLegacyStore.init()

    expect(emptyLegacyStore.categories).toEqual([])
    expect(localStorage.setItem).toHaveBeenCalledWith('act-flexi-preset-categories', '[]')

    const assignedLegacyStore = await createStore({
      'act-flexi-custom-presets': JSON.stringify([
        { name: 'Saved', category: 'User', profile: mocks.config.profile },
      ]),
      'act-flexi-preset-categories': JSON.stringify([{ name: 'User', collapsed: false }]),
    })

    await assignedLegacyStore.init()

    expect(assignedLegacyStore.categories).toEqual([{ name: 'User', collapsed: false }])
    expect(assignedLegacyStore.presetsInCategory('User')).toHaveLength(1)
  })

  it('renames and deletes categories while moving affected presets', async () => {
    const store = await createStore()
    store.categories = [{ name: 'Raid', collapsed: false }]
    store.customPresets = [
      { name: 'A', category: 'Raid', profile: mocks.config.profile as any },
      { name: 'B', category: '', profile: mocks.config.profile as any },
    ]

    store.renameCategory('Raid', 'Ultimate')

    expect(store.categories).toEqual([{ name: 'Ultimate', collapsed: false }])
    expect(store.customPresets[0].category).toBe('Ultimate')
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'act-flexi-preset-categories',
      JSON.stringify(store.categories),
    )

    store.deleteCategory('Ultimate')

    expect(store.categories).toEqual([])
    expect(store.customPresets[0].category).toBe('')
  })

  it('toggles built-in and custom category collapse state', async () => {
    const store = await createStore()
    store.categories = [{ name: 'User', collapsed: false }]

    store.toggleCategoryCollapse('__builtin')
    store.toggleCategoryCollapse('User')

    expect(store.builtInCollapsed).toBe(true)
    expect(store.categories[0].collapsed).toBe(true)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'act-flexi-category-collapse',
      JSON.stringify({ __builtin: true, User: true }),
    )
  })
})

describe('presets store import and export', () => {
  it('imports JSON presets and reports name conflicts', async () => {
    const store = await createStore()
    store.customPresets = [{ name: 'Existing', category: '', profile: mocks.config.profile as any }]

    const result = await store.importFromString(JSON.stringify([
      { name: 'Existing', profile: { name: 'Existing' } },
      { name: 'New', profile: { name: 'New' } },
    ]))

    expect(result.conflicts).toEqual(['Existing'])
    expect(result.imported).toEqual([
      { name: 'Existing', profile: { name: 'Existing' }, category: '' },
      { name: 'New', profile: { name: 'New' }, category: '' },
    ])
  })

  it('imports share strings and rejects invalid input without changing state', async () => {
    const store = await createStore()
    mocks.isShareString.mockReturnValue(true)
    mocks.decodeShareString.mockResolvedValue([{ name: 'Shared', profile: { name: 'Shared' } }])

    await expect(store.importFromString('flexi:encoded')).resolves.toEqual({
      conflicts: [],
      imported: [{ name: 'Shared', profile: { name: 'Shared' }, category: '' }],
    })

    mocks.decodeShareString.mockResolvedValue(null)
    await expect(store.importFromString('flexi:bad')).resolves.toEqual({ conflicts: [], imported: [] })
  })

  it('adds imported presets and handles overwrite/copy conflict strategies', async () => {
    const store = await createStore()
    store.customPresets = [
      { name: 'A', category: '', profile: { version: 1 } as any },
    ]

    store.addImportedPresets([{ name: 'B', category: '', profile: { version: 1 } as any }])
    store.handleConflictOverwrite([{ name: 'A', category: '', profile: { version: 2 } as any }])
    store.handleConflictCopy([{ name: 'A', category: '', profile: { version: 3 } as any }])

    expect(store.customPresets.map(p => p.name)).toEqual(['A', 'B', 'A2'])
    expect(store.customPresets[0].profile).toEqual({ version: 2 })
    expect(store.customPresets[2].profile).toEqual({ version: 3 })
  })

  it('exports one or all custom presets through the share codec', async () => {
    const store = await createStore()
    store.customPresets = [
      { name: 'One', category: '', profile: { name: 'One' } as any },
      { name: 'Two', category: '', profile: { name: 'Two' } as any },
    ]
    mocks.encodeShareString.mockResolvedValue('encoded')

    await expect(store.exportPreset(0)).resolves.toBe('encoded')
    expect(mocks.encodeShareString).toHaveBeenCalledWith([
      { name: 'One', profile: { name: 'One' } },
    ])

    await expect(store.exportAll()).resolves.toBe('encoded')
    expect(mocks.encodeShareString).toHaveBeenLastCalledWith([
      { name: 'One', profile: { name: 'One' } },
      { name: 'Two', profile: { name: 'Two' } },
    ])
  })

  it('updates the badge from the config profile name or saved preset count', async () => {
    const store = await createStore()

    expect(store.badge).toBe('None')
    store.customPresets = [{ name: 'Saved', category: '', profile: mocks.config.profile as any }]
    await nextTick()
    expect(store.badge).toBe('1 saved')

    mocks.config.profile.name = 'Named'
    const namedStore = await createStore()
    expect(namedStore.badge).toBe('Named')
  })
})
