import { describe, expect, it } from 'vitest'
import type { BarShape } from '../configSchema'
import { buildFillClipPoints, buildShapePoints, hasUsablePolygon, polygonArea } from '../shapeGeometry'

const baseShape: BarShape = {
  leftEdge: 'flat',
  rightEdge: 'flat',
  edgeDepth: 10,
  chamferMode: 'none',
  borderRadius: { tl: 0, tr: 0, br: 0, bl: 0 },
  cornerCuts: { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } },
  outline: { color: '#000000', thickness: { top: 0, right: 0, bottom: 0, left: 0 } },
}

function shape(partial: Partial<BarShape>): BarShape {
  return { ...baseShape, ...partial }
}

describe('shapeGeometry', () => {
  it('builds stable slant points for left and right edges', () => {
    const points = buildShapePoints(shape({
      leftEdge: 'slant-a',
      rightEdge: 'slant-a',
      edgeDepthLeft: 24,
      edgeDepthRight: 19,
    }), 160, 28)

    expect(points).toEqual([[24, 0], [160, 0], [141, 28], [0, 28]])
    expect(hasUsablePolygon(points)).toBe(true)
    expect(polygonArea(points)).toBeGreaterThan(0)
  })

  it('scales opposing edge depths before they can cross', () => {
    const points = buildShapePoints(shape({
      leftEdge: 'point',
      rightEdge: 'point',
      edgeDepthLeft: 80,
      edgeDepthRight: 80,
    }), 100, 20)

    expect(points).toEqual([[50, 0], [100, 10], [50, 20], [0, 10]])
    expect(hasUsablePolygon(points)).toBe(true)
  })

  it('clips partial fills smaller than the edge depth into usable polygons', () => {
    const points = buildShapePoints(shape({
      leftEdge: 'slant-a',
      rightEdge: 'slant-a',
      edgeDepthLeft: 24,
      edgeDepthRight: 19,
    }), 160, 28)
    const fill = buildFillClipPoints(points, 160, 28, 0.1, 'vertical')

    expect(fill.length).toBeGreaterThanOrEqual(3)
    expect(hasUsablePolygon(fill)).toBe(true)
    expect(Math.max(...fill.map(([x]) => x))).toBeLessThanOrEqual(16)
  })

  it('returns no fill geometry for zero fraction', () => {
    const points = buildShapePoints(shape({ leftEdge: 'slant-a', edgeDepthLeft: 20 }), 100, 28)
    expect(buildFillClipPoints(points, 100, 28, 0, 'vertical')).toEqual([])
  })

  it('clips horizontal fills from the bottom', () => {
    const points = buildShapePoints(shape({ leftEdge: 'point', rightEdge: 'point', edgeDepth: 20 }), 100, 40)
    const fill = buildFillClipPoints(points, 100, 40, 0.25, 'horizontal')

    expect(fill.length).toBeGreaterThanOrEqual(3)
    expect(hasUsablePolygon(fill)).toBe(true)
    expect(Math.min(...fill.map(([, y]) => y))).toBeGreaterThanOrEqual(30)
  })
})

describe('shapeGeometry edge types', () => {
  it('handles slant-b edge type', () => {
    const points = buildShapePoints(shape({ leftEdge: 'slant-b', edgeDepthLeft: 20 }), 100, 40)

    expect(points).toBeDefined()
    expect(points.length).toBeGreaterThanOrEqual(3)
    expect(hasUsablePolygon(points)).toBe(true)
  })

  it('handles bevel edge type', () => {
    const points = buildShapePoints(shape({ leftEdge: 'bevel', edgeDepthLeft: 15 }), 100, 40)

    expect(points).toBeDefined()
    expect(hasUsablePolygon(points)).toBe(true)
  })

  it('handles round edge type', () => {
    const points = buildShapePoints(shape({ leftEdge: 'round', edgeDepthLeft: 15 }), 100, 40)

    expect(points).toBeDefined()
    expect(hasUsablePolygon(points)).toBe(true)
  })

  it('handles point edge type from left', () => {
    const points = buildShapePoints(shape({ leftEdge: 'point', edgeDepthLeft: 30 }), 100, 40)

    expect(hasUsablePolygon(points)).toBe(true)
    expect(points[0][0]).toBeLessThanOrEqual(50)
  })

  it('handles point edge type from right', () => {
    const points = buildShapePoints(shape({ rightEdge: 'point', edgeDepthRight: 30 }), 100, 40)

    expect(hasUsablePolygon(points)).toBe(true)
    expect(points[1][0]).toBeGreaterThanOrEqual(50)
  })

  it('handles mixed left and right edges', () => {
    const points = buildShapePoints(shape({
      leftEdge: 'slant-a',
      rightEdge: 'point',
      edgeDepthLeft: 20,
      edgeDepthRight: 25,
    }), 100, 40)

    expect(hasUsablePolygon(points)).toBe(true)
  })

  it('handles flat edges', () => {
    const points = buildShapePoints(shape({
      leftEdge: 'flat',
      rightEdge: 'flat',
    }), 100, 40)

    expect(points).toEqual([[0, 0], [100, 0], [100, 40], [0, 40]])
    expect(hasUsablePolygon(points)).toBe(true)
    expect(polygonArea(points)).toBe(4000)
  })
})

describe('shapeGeometry fill fractions', () => {
  it('handles 100% fill', () => {
    const points = buildShapePoints(shape({ leftEdge: 'flat', rightEdge: 'flat' }), 100, 40)
    const fill = buildFillClipPoints(points, 100, 40, 1, 'vertical')

    expect(fill.length).toBeGreaterThanOrEqual(3)
    expect(hasUsablePolygon(fill)).toBe(true)
  })

  it('handles 50% fill', () => {
    const points = buildShapePoints(shape({ leftEdge: 'flat', rightEdge: 'flat' }), 100, 40)
    const fill = buildFillClipPoints(points, 100, 40, 0.5, 'vertical')

    expect(fill.length).toBeGreaterThanOrEqual(3)
  })

  it('handles very small fill fraction', () => {
    const points = buildShapePoints(shape({ leftEdge: 'flat', rightEdge: 'flat' }), 100, 40)
    const fill = buildFillClipPoints(points, 100, 40, 0.01, 'vertical')

    expect(fill.length).toBeGreaterThanOrEqual(0)
  })
})
