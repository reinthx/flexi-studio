import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '../presets'
import type { Profile } from '../configSchema'

vi.mock('virtual:custom-fonts', () => ({
  default: {
    Orbitron: './assets/fonts/Orbitron.ttf',
    OstrichSans: './assets/fonts/OstrichSans.ttf',
  },
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

function installDomGlobals(initialStorage: Record<string, string> = {}) {
  const appended: Array<{ tagName: string; textContent?: string; rel?: string; href?: string }> = []
  const document = {
    createElement: vi.fn((tagName: string) => ({
      tagName,
      textContent: '',
      rel: '',
      href: '',
    })),
    head: {
      appendChild: vi.fn((node) => {
        appended.push(node)
        return node
      }),
    },
  }
  vi.stubGlobal('document', document)
  vi.stubGlobal('localStorage', createLocalStorageMock(initialStorage))
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/'/g, "\\'") })
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:font') })
  return { appended, document }
}

async function loadGoogleFonts(initialStorage: Record<string, string> = {}) {
  vi.resetModules()
  const globals = installDomGlobals(initialStorage)
  const mod = await import('../googleFonts')
  return { ...mod, ...globals }
}

function profileWithFonts(fonts: string[]): Profile {
  const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE)) as Profile
  profile.default.label.font = fonts[0] ?? 'Segoe UI'
  profile.default.label.fields = [
    {
      id: 'field',
      template: '{name}',
      hAnchor: 'left',
      vAnchor: 'middle',
      offsetX: 0,
      offsetY: 0,
      enabled: true,
      font: fonts[1],
    },
  ]
  profile.global.header.font = fonts[2]
  profile.overrides.byRole.tank = {
    label: { font: fonts[3] },
  }
  return profile
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('font favorites', () => {
  it('reads corrupt favorites as empty and persists toggles', async () => {
    const { getFontFavorites, toggleFontFavorite } = await loadGoogleFonts({
      'act-flexi-font-favorites': '{bad-json',
    })

    expect(getFontFavorites()).toEqual([])
    expect(toggleFontFavorite('Inter')).toEqual(['Inter'])
    expect(toggleFontFavorite('Inter')).toEqual([])
    expect(localStorage.setItem).toHaveBeenLastCalledWith(
      'act-flexi-font-favorites',
      '[]',
    )
  })
})

describe('font sources', () => {
  it('migrates the legacy custom font URL into font sources', async () => {
    const { getFontSources } = await loadGoogleFonts({
      'act-flexi-custom-font-url': 'https://example.test/fonts',
    })

    const sources = getFontSources()

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      label: 'Custom',
      baseUrl: 'https://example.test/fonts',
      fonts: [],
    })
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'act-flexi-font-sources',
      expect.stringContaining('https://example.test/fonts'),
    )
    expect(localStorage.removeItem).toHaveBeenCalledWith('act-flexi-custom-font-url')
  })

  it('dedupes, trims, sorts, and caches user custom font names until sources change', async () => {
    const { getUserCustomFontNames, isUserCustomFont, setFontSources } = await loadGoogleFonts()

    setFontSources([
      { id: 'one', label: 'One', baseUrl: '/fonts', fonts: [' Zeta ', 'Alpha', ''] },
      { id: 'two', label: 'Two', baseUrl: '/more-fonts', fonts: ['Alpha', 'Beta'] },
    ])

    expect(getUserCustomFontNames()).toEqual(['Alpha', 'Beta', 'Zeta'])
    expect(isUserCustomFont('Beta')).toBe(true)

    setFontSources([{ id: 'three', label: 'Three', baseUrl: '/fonts', fonts: ['Gamma'] }])
    expect(getUserCustomFontNames()).toEqual(['Gamma'])
  })
})

describe('font loading', () => {
  it('loads Google fonts once by appending stylesheet links', async () => {
    const { appended, loadGoogleFont } = await loadGoogleFonts()

    loadGoogleFont('Inter')
    loadGoogleFont('Inter')
    loadGoogleFont('Not Real')

    expect(appended).toHaveLength(1)
    expect(appended[0]).toMatchObject({
      tagName: 'link',
      rel: 'stylesheet',
      href: expect.stringContaining('fonts.googleapis.com/css2?family=Inter'),
    })
  })

  it('loads built-in and runtime custom fonts as font-face styles', async () => {
    const { appended, loadCustomFont, setFontSources } = await loadGoogleFonts()

    loadCustomFont('Orbitron')
    setFontSources([{ id: 'runtime', label: 'Runtime', baseUrl: 'https://fonts.test', fonts: ['Runtime Font'] }])
    loadCustomFont('Runtime Font')
    loadCustomFont('Missing Font')

    expect(appended).toHaveLength(3)
    expect(appended[0].textContent).toContain("font-family: 'Orbitron'")
    expect(appended[0].textContent).toContain('./assets/fonts/Orbitron.ttf')
    expect(appended[1].textContent).toContain("font-family: 'Runtime Font'")
    expect(appended[1].textContent).toContain('Runtime%20Font.woff2')
    expect(appended[1].textContent).toContain('Runtime%20Font.ttf')
    expect(appended[2].textContent).toContain("font-family: 'Missing Font'")
    expect(appended[2].textContent).toContain('Missing%20Font.woff2')
  })

  it('loads supported font files from a directory handle and skips unsupported/read-failing files', async () => {
    const goodFile = new File(['font'], 'GoodFont.woff2')
    const entries = [
      { kind: 'file', name: 'GoodFont.woff2', getFile: vi.fn().mockResolvedValue(goodFile) },
      { kind: 'file', name: 'Notes.txt', getFile: vi.fn() },
      { kind: 'file', name: 'Broken.ttf', getFile: vi.fn().mockRejectedValue(new Error('nope')) },
      { kind: 'directory', name: 'Nested' },
    ]
    const handle = {
      async *values() {
        for (const entry of entries) yield entry
      },
    }
    const { appended, loadFontsFromDirectoryHandle } = await loadGoogleFonts()

    await expect(loadFontsFromDirectoryHandle(handle as any)).resolves.toEqual(['GoodFont'])

    expect(URL.createObjectURL).toHaveBeenCalledWith(goodFile)
    expect(appended).toHaveLength(1)
    expect(appended[0].textContent).toContain("font-family: 'GoodFont'")
  })
})

describe('bulk font loading', () => {
  it('loads configured custom fonts before Google fonts in a delayed batch', async () => {
    const { appended, loadFontBatch, setFontSources } = await loadGoogleFonts()
    setFontSources([{ id: 'runtime', label: 'Runtime', baseUrl: '/fonts', fonts: ['Runtime Font'] }])
    const promise = loadFontBatch(profileWithFonts(['Runtime Font', 'Inter', 'Orbitron', 'Roboto']), 10)

    await vi.advanceTimersByTimeAsync(10)
    expect(appended[0].textContent).toContain("font-family: 'Runtime Font'")
    await vi.advanceTimersByTimeAsync(10)
    expect(appended[1].textContent).toContain("font-family: 'Orbitron'")
    await vi.advanceTimersByTimeAsync(10)
    expect(appended[2].href).toContain('family=Inter')
    await vi.advanceTimersByTimeAsync(10)
    expect(appended[3].href).toContain('family=Roboto')
    await vi.advanceTimersByTimeAsync(10)
    await expect(promise).resolves.toBeUndefined()
  })
})
