import type { Profile, BarLabel } from './configSchema'
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

const loadedFonts = new Set<string>()
const loadedCustomFonts = new Set<string>()

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

  const path = CUSTOM_FONTS[family]
  if (!path) return

  loadedCustomFonts.add(family)

  const style = document.createElement('style')
  style.textContent = `
    @font-face {
      font-family: '${family}';
      src: url('${path}') format('truetype');
    }
  `
  document.head.appendChild(style)
}

export function loadAllConfiguredFonts(profile: Profile): void {
  const fonts = new Set<string>([
    profile.default.label?.font,
    profile.global.header?.font,
    profile.global.footer?.font,
  ])

  for (const font of fonts) {
    if (font) {
      if (isGoogleFont(font)) {
        loadGoogleFont(font)
      } else if (isCustomFont(font)) {
        loadCustomFont(font)
      }
    }
  }

  for (const role in profile.overrides.byRole) {
    const style = profile.overrides.byRole[role]
    const font = style.label?.font
    if (font) {
      if (isGoogleFont(font)) loadGoogleFont(font)
      else if (isCustomFont(font)) loadCustomFont(font)
    }
  }
  for (const job in profile.overrides.byJob) {
    const style = profile.overrides.byJob[job]
    const font = style.label?.font
    if (font) {
      if (isGoogleFont(font)) loadGoogleFont(font)
      else if (isCustomFont(font)) loadCustomFont(font)
    }
  }
}

export function isGoogleFont(fontName: string): boolean {
  return fontName in GOOGLE_FONTS
}

export function isCustomFont(fontName: string): boolean {
  return fontName in CUSTOM_FONTS
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
      for (const field of label.fields) {
        collectFont(field.font)
      }
    }
  }

  collectLabelFonts(profile.default.label)
  collectLabelFonts(profile.global.header as BarLabel)
  collectLabelFonts(profile.global.footer as BarLabel)

  for (const role in profile.overrides.byRole) {
    collectLabelFonts(profile.overrides.byRole[role].label as BarLabel)
  }
  for (const job in profile.overrides.byJob) {
    collectLabelFonts(profile.overrides.byJob[job].label as BarLabel)
  }

  const fontList = Array.from(fonts)
  const customFonts = fontList.filter(f => isCustomFont(f))
  const googleFonts = fontList.filter(f => isGoogleFont(f))
  const allFonts = [...customFonts, ...googleFonts]

  if (allFonts.length === 0) return Promise.resolve()

  return new Promise((resolve) => {
    let index = 0
    const interval = setInterval(() => {
      if (index >= allFonts.length) {
        clearInterval(interval)
        resolve()
        return
      }
      const font = allFonts[index]
      if (isCustomFont(font)) {
        loadCustomFont(font)
      } else if (isGoogleFont(font)) {
        loadGoogleFont(font)
      }
      index++
    }, delayMs)
  })
}
