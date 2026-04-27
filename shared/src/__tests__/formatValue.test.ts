import { describe, it, expect } from 'vitest'
import { formatValue } from '../formatValue'

describe('formatValue', () => {
  describe('raw format', () => {
    it('returns rounded integer', () => {
      expect(formatValue(1234.56, 'raw')).toBe('1235')
      expect(formatValue(999.49, 'raw')).toBe('999')
    })
  })

  describe('abbreviated format', () => {
    it('formats thousands with k suffix', () => {
      expect(formatValue(1000, 'abbreviated')).toBe('1.0k')
      expect(formatValue(1500, 'abbreviated')).toBe('1.5k')
      expect(formatValue(999999, 'abbreviated')).toBe('1000.0k')
    })

    it('formats millions with M suffix', () => {
      expect(formatValue(1000000, 'abbreviated')).toBe('1.00M')
      expect(formatValue(1500000, 'abbreviated')).toBe('1.50M')
      expect(formatValue(10000000, 'abbreviated')).toBe('10.00M')
    })

    it('returns integer for values under 1000', () => {
      expect(formatValue(999, 'abbreviated')).toBe('999')
      expect(formatValue(1, 'abbreviated')).toBe('1')
    })
  })

  describe('formatted format', () => {
    it('returns locale-formatted integer', () => {
      expect(formatValue(1000, 'formatted')).toBe('1,000')
      expect(formatValue(1000000, 'formatted')).toBe('1,000,000')
    })
  })

  describe('NaN handling', () => {
    it('returns --- for NaN', () => {
      expect(formatValue(NaN, 'raw')).toBe('---')
      expect(formatValue(NaN, 'abbreviated')).toBe('---')
      expect(formatValue(NaN, 'formatted')).toBe('---')
    })
  })
})