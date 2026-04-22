import { describe, expect, it } from 'vitest'
import { normalizeFontRequestUrl } from '../../../build/customFontsPlugin'

describe('customFontsPlugin', () => {
  it('normalizes mounted and full font request URLs', () => {
    expect(normalizeFontRequestUrl('/assets/fonts/OstrichSans-Black.otf')).toBe('OstrichSans-Black.otf')
    expect(normalizeFontRequestUrl('/OstrichSans-Black.otf')).toBe('OstrichSans-Black.otf')
  })

  it('decodes escaped font filenames and ignores query strings', () => {
    expect(normalizeFontRequestUrl('/assets/fonts/Orbitron%20Black.ttf?v=1')).toBe('Orbitron Black.ttf')
  })
})
