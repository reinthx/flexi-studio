import type { Profile, BarLabel, Job, Role } from './configSchema'
import CUSTOM_FONTS_MAP from 'virtual:custom-fonts'

const GOOGLE_FONTS: Record<string, string> = {
  'Inter': 'Inter:wght@400;500;600;700',
  'Roboto': 'Roboto:wght@400;500;700',
  'Open Sans': 'Open+Sans:wght@400;600;700',
  'Source Sans 3': 'Source+Sans+3:wght@400;600;700',
  'Nunito': 'Nunito:wght@400;600;700',
  'Poppins': 'Poppins:wght@400;500;600;700',
  'Fira Code': 'Fira+Code:wght@400;500',
  'JetBrains Mono': 'JetBrains+Mono:wght@400;500',
  'Ubuntu': 'Ubuntu:wght@400;500;700',
  'Montserrat': 'Montserrat:wght@400;500;600;700',
  'Lato': 'Lato:wght@400;700',
  'Raleway': 'Raleway:wght@400;600;700',
  'Work Sans': 'Work+Sans:wght@400;500;600',
  'DM Sans': 'DM+Sans:wght@400;500;700',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700',
  'Noto Sans': 'Noto+Sans:wght@400;500;600;700',
  'Libre Franklin': 'Libre+Franklin:wght@400;500;600;700',
  'Karla': 'Karla:wght@400;500;600;700',
  'Manrope': 'Manrope:wght@400;500;600;700',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700',
  'Outfit': 'Outfit:wght@400;500;600;700',
  'Sora': 'Sora:wght@400;500;600;700',
  'Albert Sans': 'Albert+Sans:wght@400;500;600;700',
  'Instrument Sans': 'Instrument+Sans:wght@400;500;600;700',
  'Red Hat Text': 'Red+Hat+Text:wght@400;500;600;700',
  'Archivo': 'Archivo:wght@400;500;600;700',
  'Urbanist': 'Urbanist:wght@400;500;600;700',
  'Bitter': 'Bitter:wght@400;500;600;700',
  'Merriweather': 'Merriweather:wght@400;500;600;700',
  'Crimson Pro': 'Crimson+Pro:wght@400;500;600;700',
  'Playfair Display': 'Playfair+Display:wght@400;500;600;700',
}

/**
 * Auto-discovered from the /fonts folder at build time via the customFontsPlugin.
 * Paths are relative (./assets/fonts/...) so they work in both file:// overlay
 * context and the editor's dev server.
 */
const CUSTOM_FONTS: Record<string, string> = CUSTOM_FONTS_MAP

// ─── Font Sources (runtime, localStorage-based) ───────────────────────────────

export interface FontSource {
  id: string
  /** Human-readable label shown in editor */
  label: string
  /** Base URL or file:// path to the fonts folder */
  baseUrl: string
  /** Font names available at this source (user-declared) */
  fonts: string[]
}

const FONT_SOURCES_KEY = 'act-flexi-font-sources'
const LEGACY_URL_KEY = 'act-flexi-custom-font-url'
const FONT_FAVORITES_KEY = 'act-flexi-font-favorites'

export function getFontFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FONT_FAVORITES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function toggleFontFavorite(font: string): string[] {
  const favs = getFontFavorites()
  const idx = favs.indexOf(font)
  if (idx >= 0) favs.splice(idx, 1)
  else favs.push(font)
  try { localStorage.setItem(FONT_FAVORITES_KEY, JSON.stringify(favs)) } catch {}
  return favs
}

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

let _userFontsCache: string[] | null = null

function invalidateCache(): void {
  _userFontsCache = null
}

function saveFontSources(sources: FontSource[]): void {
  try { localStorage.setItem(FONT_SOURCES_KEY, JSON.stringify(sources)) } catch { /* storage unavailable */ }
}

export function getFontSources(): FontSource[] {
  try {
    const raw = localStorage.getItem(FONT_SOURCES_KEY)
    const sources: FontSource[] = raw ? JSON.parse(raw) : []

    // Migrate old single-URL key → first source entry
    const legacyUrl = localStorage.getItem(LEGACY_URL_KEY)
    if (legacyUrl && !sources.some(s => s.baseUrl === legacyUrl)) {
      sources.unshift({ id: makeId(), label: 'Custom', baseUrl: legacyUrl, fonts: [] })
      saveFontSources(sources)
      try { localStorage.removeItem(LEGACY_URL_KEY) } catch {}
      invalidateCache()
    }

    return sources
  } catch { return [] }
}

export function setFontSources(sources: FontSource[]): void {
  saveFontSources(sources)
  invalidateCache()
  loadedCustomFonts.clear()
}

/** Union of all user-declared font names across all sources. Cached until sources change. */
export function getUserCustomFontNames(): string[] {
  if (_userFontsCache) return _userFontsCache
  const sources = getFontSources()
  const names = new Set<string>()
  for (const s of sources) {
    for (const f of s.fonts) {
      const trimmed = f.trim()
      if (trimmed) names.add(trimmed)
    }
  }
  _userFontsCache = Array.from(names).sort((a, b) => a.localeCompare(b))
  return _userFontsCache
}

// ─── Font loading ─────────────────────────────────────────────────────────────

const loadedFonts = new Set<string>()
const loadedCustomFonts = new Set<string>()

function injectFontFace(css: string): void {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}

const FILE_FORMAT_MAP: Record<string, string> = {
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'truetype',
  '.otf': 'opentype',
}

function fontFormatForPath(path: string): string {
  const lowerPath = path.toLowerCase()
  const ext = Object.keys(FILE_FORMAT_MAP).find(e => lowerPath.endsWith(e))
  return ext ? FILE_FORMAT_MAP[ext] : 'truetype'
}

/**
 * Load a font directly from a File object (e.g. from a file input / webkitdirectory).
 * Creates a blob URL — works from any origin, no server required.
 * Session-only: blob URL is revoked when the page is closed.
 */
export function loadFontFromFile(file: File, family: string): void {
  if (loadedCustomFonts.has(family)) return
  const ext = Object.keys(FILE_FORMAT_MAP).find(e => file.name.toLowerCase().endsWith(e))
  if (!ext) return
  const format = FILE_FORMAT_MAP[ext]
  const blobUrl = URL.createObjectURL(file)
  loadedCustomFonts.add(family)
  injectFontFace(`@font-face { font-family: '${CSS.escape(family)}'; src: url('${blobUrl}') format('${format}'); }`)
}

// ─── IndexedDB: FileSystemDirectoryHandle persistence ─────────────────────────
// Stores a handle per font source so the directory can be re-read on next
// session without re-browsing (permission is auto-granted for previously-
// granted handles in the same origin).

const FONT_DB_NAME = 'act-flexi-fonts'
const FONT_DB_STORE = 'font-dirs'
const FONT_DB_VERSION = 1

function openFontDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FONT_DB_NAME, FONT_DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(FONT_DB_STORE, { keyPath: 'sourceId' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function storeDirectoryHandle(sourceId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openFontDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FONT_DB_STORE, 'readwrite')
    tx.objectStore(FONT_DB_STORE).put({ sourceId, handle })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function removeDirectoryHandle(sourceId: string): Promise<void> {
  const db = await openFontDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FONT_DB_STORE, 'readwrite')
    tx.objectStore(FONT_DB_STORE).delete(sourceId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function getAllDirectoryHandles(): Promise<Array<{ sourceId: string; handle: FileSystemDirectoryHandle }>> {
  const db = await openFontDb()
  const result = await new Promise<Array<{ sourceId: string; handle: FileSystemDirectoryHandle }>>((resolve, reject) => {
    const tx = db.transaction(FONT_DB_STORE, 'readonly')
    const req = tx.objectStore(FONT_DB_STORE).getAll()
    req.onsuccess = () => resolve(req.result as Array<{ sourceId: string; handle: FileSystemDirectoryHandle }>)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

/** Read all font files from a directory handle and inject @font-face rules. Returns loaded family names. */
export async function loadFontsFromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<string[]> {
  const loaded: string[] = []
  for await (const entry of (handle as any).values() as AsyncIterable<FileSystemHandle>) {
    if (entry.kind !== 'file') continue
    const name = entry.name
    const ext = Object.keys(FILE_FORMAT_MAP).find(e => name.toLowerCase().endsWith(e))
    if (!ext) continue
    const family = name.slice(0, -ext.length)
    if (loadedCustomFonts.has(family)) { loaded.push(family); continue }
    try {
      const file: File = await (entry as FileSystemFileHandle).getFile()
      const blobUrl = URL.createObjectURL(file)
      loadedCustomFonts.add(family)
      injectFontFace(`@font-face { font-family: '${CSS.escape(family)}'; src: url('${blobUrl}') format('${FILE_FORMAT_MAP[ext]}'); }`)
      loaded.push(family)
    } catch { /* file read error — skip */ }
  }
  return loaded
}

/**
 * Called on editor startup. Re-loads fonts from stored directory handles.
 * Skips sources where permission was not previously granted.
 */
export async function restoreDirectoryFonts(): Promise<void> {
  let entries: Array<{ sourceId: string; handle: FileSystemDirectoryHandle }>
  try { entries = await getAllDirectoryHandles() } catch { return }
  for (const { handle } of entries) {
    try {
      const perm = await (handle as any).queryPermission({ mode: 'read' })
      if (perm === 'granted') await loadFontsFromDirectoryHandle(handle)
    } catch { /* stale or invalid handle — ignore */ }
  }
}

export function getGoogleFontsList(): { name: string; family: string }[] {
  return Object.entries(GOOGLE_FONTS).map(([name, family]) => ({ name, family }))
}

export function getCustomFontsList(): { name: string; path: string }[] {
  return Object.entries(CUSTOM_FONTS).map(([name, path]) => ({ name, path }))
}

export function loadGoogleFont(family: string): void {
  if (loadedFonts.has(family)) return
  const gfonts = GOOGLE_FONTS[family]
  if (!gfonts) return
  loadedFonts.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${gfonts}&display=swap`
  document.head.appendChild(link)
}

export function loadCustomFont(family: string): void {
  if (loadedCustomFonts.has(family)) return

  // 1. Build-time compiled fonts (/fonts directory at build time)
  const builtInPath = CUSTOM_FONTS[family]
  if (builtInPath) {
    loadedCustomFonts.add(family)
    injectFontFace(`@font-face { font-family: '${CSS.escape(family)}'; src: url('${builtInPath}') format('${fontFormatForPath(builtInPath)}'); }`)
    return
  }

  // 2. Runtime user font sources (localStorage-configured)
  //    All source URLs are tried — browser uses first that resolves.
  const sources = getFontSources()
  if (!sources.length) return

  const srcs: string[] = []
  for (const source of sources) {
    if (!source.baseUrl) continue  // skip unconfigured sources — empty baseUrl resolves to current origin
    const base = source.baseUrl.endsWith('/') ? source.baseUrl : `${source.baseUrl}/`
    srcs.push(`url('${base}${encodeURIComponent(family)}.woff2') format('woff2')`)
    srcs.push(`url('${base}${encodeURIComponent(family)}.ttf') format('truetype')`)
  }

  if (!srcs.length) return
  loadedCustomFonts.add(family)
  injectFontFace(`@font-face { font-family: '${CSS.escape(family)}'; src: ${srcs.join(', ')}; }`)
}

// ─── Font classification ──────────────────────────────────────────────────────

export function isGoogleFont(fontName: string): boolean {
  return fontName in GOOGLE_FONTS
}

export function isBuiltInCustomFont(fontName: string): boolean {
  return fontName in CUSTOM_FONTS
}

export function isUserCustomFont(fontName: string): boolean {
  return getUserCustomFontNames().includes(fontName)
}

export function isCustomFont(fontName: string): boolean {
  return isBuiltInCustomFont(fontName) || isUserCustomFont(fontName)
}

// ─── Bulk font loading ────────────────────────────────────────────────────────

export function loadAllConfiguredFonts(profile: Profile): void {
  const fonts = new Set<string>([
    profile.default.label?.font,
    profile.global.header?.font,
    profile.global.footer?.font,
  ])

  for (const font of fonts) {
    if (font) {
      if (isGoogleFont(font)) loadGoogleFont(font)
      else if (isCustomFont(font)) loadCustomFont(font)
    }
  }

  for (const role in profile.overrides.byRole) {
    const font = profile.overrides.byRole[role as Role]?.label?.font
    if (font) {
      if (isGoogleFont(font)) loadGoogleFont(font)
      else if (isCustomFont(font)) loadCustomFont(font)
    }
  }
  for (const job in profile.overrides.byJob) {
    const font = profile.overrides.byJob[job as Job]?.label?.font
    if (font) {
      if (isGoogleFont(font)) loadGoogleFont(font)
      else if (isCustomFont(font)) loadCustomFont(font)
    }
  }
}

export function loadFontBatch(profile: Profile, delayMs: number = 333): Promise<void> {
  const fonts = new Set<string>()

  function collectFont(font?: string) {
    if (font) fonts.add(font)
  }

  function collectLabelFonts(label?: BarLabel) {
    if (!label) return
    collectFont(label.font)
    if (label.fields) {
      for (const field of label.fields) collectFont(field.font)
    }
  }

  collectLabelFonts(profile.default.label)
  collectFont(profile.global.header?.font)
  collectFont(profile.global.footer?.font)

  for (const role in profile.overrides.byRole) {
    collectLabelFonts(profile.overrides.byRole[role as Role]?.label)
  }
  for (const job in profile.overrides.byJob) {
    collectLabelFonts(profile.overrides.byJob[job as Job]?.label)
  }

  const fontList = Array.from(fonts)
  const customFonts = fontList.filter(f => isCustomFont(f))
  const googleFonts = fontList.filter(f => isGoogleFont(f))
  const allFonts = [...customFonts, ...googleFonts]

  if (allFonts.length === 0) return Promise.resolve()

  return new Promise((resolve) => {
    let index = 0
    const interval = setInterval(() => {
      if (index >= allFonts.length) { clearInterval(interval); resolve(); return }
      const font = allFonts[index]
      if (isCustomFont(font)) loadCustomFont(font)
      else if (isGoogleFont(font)) loadGoogleFont(font)
      index++
    }, delayMs)
  })
}
