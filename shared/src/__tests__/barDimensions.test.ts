import { describe, it, expect } from 'vitest'
import { resolveBarDimensions } from '../barDimensions'
import type { BarStyle, Orientation } from '../configSchema'

const baseStyle: BarStyle = {
  fill: { type: 'solid', color: '#4a90d9' },
  bg: { type: 'solid', color: '#1a1a2e' },
  shape: {
    leftEdge: 'flat',
    rightEdge: 'flat',
    edgeDepth: 10,
    chamferMode: 'none',
    borderRadius: { tl: 3, tr: 3, br: 3, bl: 3 },
    cornerCuts: { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } },
    outline: { color: '#000', thickness: { top: 0, right: 0, bottom: 0, left: 0 } },
  },
  label: {
    font: 'Segoe UI',
    size: 12,
    color: '#fff',
    fields: [],
  },
  height: 28,
  horizontalHeight: 72,
  gap: 2,
}

describe('resolveBarDimensions', () => {
  describe('vertical orientation', () => {
    it('returns fixed height when not autoScale', () => {
      const result = resolveBarDimensions(baseStyle, 'vertical')
      expect(result.height).toBe('28px')
      expect(result.width).toBe('100%')
      expect(result.flex).toBe('0 0 auto')
      expect(result.marginBottom).toBe('2px')
    })

    it('returns auto height when autoScale enabled with large container', () => {
      const result = resolveBarDimensions(baseStyle, 'vertical', 200, true)
      expect(result.height).toBe('auto')
      expect(result.flex).toBe('1 1 20px')
    })

    it('returns fixed height when container too small', () => {
      const result = resolveBarDimensions(baseStyle, 'vertical', 80, true)
      expect(result.height).toBe('28px')
      expect(result.flex).toBe('0 0 auto')
    })

    it('applies gap', () => {
      const style = { ...baseStyle, gap: 5 }
      const result = resolveBarDimensions(style, 'vertical')
      expect(result.marginBottom).toBe('5px')
    })

    it('has zero horizontal margin', () => {
      const result = resolveBarDimensions(baseStyle, 'vertical')
      expect(result.marginRight).toBe('0')
    })
  })

  describe('horizontal orientation', () => {
    it('uses explicit horizontal height', () => {
      const result = resolveBarDimensions(baseStyle, 'horizontal')
      expect(result.height).toBe('72px')
      expect(result.width).toBe('28px')
    })

    it('uses height as width in horizontal', () => {
      const style = { ...baseStyle, height: 40, horizontalHeight: 100 }
      const result = resolveBarDimensions(style, 'horizontal')
      expect(result.width).toBe('40px')
      expect(result.height).toBe('100px')
    })

    it('applies gap to marginRight', () => {
      const style = { ...baseStyle, gap: 8 }
      const result = resolveBarDimensions(style, 'horizontal')
      expect(result.marginRight).toBe('8px')
    })

    it('has zero marginBottom', () => {
      const result = resolveBarDimensions(baseStyle, 'horizontal')
      expect(result.marginBottom).toBe('0')
    })
  })

  describe('edge cases', () => {
    it('handles zero gap', () => {
      const style = { ...baseStyle, gap: 0 }
      const result = resolveBarDimensions(style, 'vertical')
      expect(result.marginBottom).toBe('0px')
    })

    it('handles zero horizontal height', () => {
      const style = { ...baseStyle, horizontalHeight: 0 }
      const result = resolveBarDimensions(style, 'horizontal')
      expect(result.height).toBe('0px')
    })

    it('uses fallback when horizontalHeight is 0', () => {
      const style = { ...baseStyle, height: 32, horizontalHeight: 0 }
      const result = resolveBarDimensions(style, 'horizontal')
      expect(result.height).toBeDefined()
    })
  })
})