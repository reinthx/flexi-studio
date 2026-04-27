import { describe, it, expect } from 'vitest'
import { buildDropShadowFilter, buildFillCss, buildBorderRadiusCss, buildEdgeClipPath, buildCornerCutCss, buildShapeCss, buildOutlineCss, buildGradientAnimationCss } from '../cssBuilder'
import type { BarFill, BarShape, BarOutline, Orientation, GradientFill } from '../configSchema'

describe('buildDropShadowFilter', () => {
  it('returns basic drop-shadow', () => {
    const result = buildDropShadowFilter(2, 2, 4, '#000000')
    expect(result).toBe('drop-shadow(2px 2px 4px #000000)')
  })

  it('includes thickness in blur approximation', () => {
    const result = buildDropShadowFilter(1, 1, 4, '#000000', 3)
    expect(result).toBe('drop-shadow(1px 1px 7px #000000)')
  })

  it('ignores zero thickness', () => {
    const result = buildDropShadowFilter(2, 2, 4, '#000000', 0)
    expect(result).toBe('drop-shadow(2px 2px 4px #000000)')
  })

  it('handles negative thickness as zero', () => {
    const result = buildDropShadowFilter(2, 2, 4, '#000000', -1)
    expect(result).toBe('drop-shadow(2px 2px 4px #000000)')
  })
})

describe('buildFillCss', () => {
  const solidFill: BarFill = { type: 'solid', color: '#4a90d9' }
  const solidFillOpacity: BarFill = { type: 'solid', color: '#4a90d9', opacity: 0.5 }

  it('returns solid fill CSS', () => {
    const result = buildFillCss(solidFill)
    expect(result.backgroundColor).toBe('#4a90d9')
  })

  it('includes opacity when less than 1', () => {
    const result = buildFillCss(solidFillOpacity)
    expect(result.backgroundColor).toBe('#4a90d9')
    expect(result.opacity).toBe('0.5')
  })

  it('returns gradient fill CSS', () => {
    const gradientFill: BarFill = {
      type: 'gradient',
      opacity: 0.9,
      gradient: {
        type: 'linear',
        angle: 90,
        stops: [
          { position: 0, color: '#ff0000' },
          { position: 1, color: '#00ff00' },
        ],
      },
    }
    const result = buildFillCss(gradientFill)
    expect(result.backgroundImage).toContain('linear-gradient')
    expect(result.backgroundImage).toContain('90deg')
    expect(result.backgroundImage).toContain('ff0000')
    expect(result.backgroundImage).toContain('00ff00')
  })

  it('returns radial gradient', () => {
    const gradientFill: BarFill = {
      type: 'gradient',
      gradient: {
        type: 'radial',
        stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }],
      },
    }
    const result = buildFillCss(gradientFill)
    expect(result.backgroundImage).toContain('radial-gradient')
  })

  it('returns texture fill CSS', () => {
    const textureFill: BarFill = {
      type: 'texture',
      texture: {
        src: 'data:image/png;base64,abc',
        repeat: 'repeat',
        opacity: 0.8,
        blendMode: 'multiply',
      },
    }
    const result = buildFillCss(textureFill)
    expect(result.backgroundImage).toContain('url(')
    expect(result.backgroundImage).toContain('abc')
    expect(result.opacity).toBe('0.8')
    expect(result.mixBlendMode).toBe('multiply')
  })

  it('handles texture with tintColor', () => {
    const textureFill: BarFill = {
      type: 'texture',
      texture: {
        src: 'test.png',
        repeat: 'no-repeat',
        opacity: 1,
        blendMode: 'normal',
        tintColor: '#ff0000',
      },
    }
    const result = buildFillCss(textureFill)
    expect(result.backgroundColor).toBe('#ff0000')
    expect(result.backgroundBlendMode).toBe('multiply')
  })

  it('handles horizontal orientation', () => {
    const result = buildFillCss(solidFill, 0, 30, 'horizontal')
    expect(result).toBeDefined()
  })

  it('keeps paginate mode active in horizontal orientation', () => {
    const textureFill: BarFill = {
      type: 'texture',
      texture: {
        src: 'test.png',
        repeat: 'paginate',
        opacity: 1,
        blendMode: 'normal',
        pagination: { enabled: true, startOffsetX: 3, startOffsetY: 5 },
      },
    }
    const result = buildFillCss(textureFill, 2, 30, 'horizontal')
    expect(result.backgroundSize).toBe('auto')
    expect(result.backgroundRepeat).toBe('no-repeat')
    expect(result.backgroundPosition).toBe('3px -65px')
  })
})

describe('buildBorderRadiusCss', () => {
  it('returns 0 for undefined', () => {
    expect(buildBorderRadiusCss(undefined)).toBe('0')
  })

  it('returns border radius string', () => {
    const r = { tl: 4, tr: 4, br: 4, bl: 4 }
    expect(buildBorderRadiusCss(r)).toBe('4px 4px 4px 4px')
  })

  it('handles asymmetric radii', () => {
    const r = { tl: 2, tr: 4, br: 6, bl: 8 }
    expect(buildBorderRadiusCss(r)).toBe('2px 4px 6px 8px')
  })
})

describe('buildEdgeClipPath', () => {
  it('returns polygon with points', () => {
    const result = buildEdgeClipPath('flat', 'flat', 10, 10)
    expect(result).toContain('polygon')
    expect(result).toContain('0%')
    expect(result).toContain('100%')
  })

  it('builds point edge', () => {
    const result = buildEdgeClipPath('point', 'flat', 20, 10)
    expect(result).toContain('polygon')
    expect(result).toContain('50%')
  })

  it('builds slant-a edge', () => {
    const result = buildEdgeClipPath('slant-a', 'flat', 15, 0)
    expect(result).toContain('polygon')
    expect(result).toContain('15')
  })

  it('builds slant-b edge', () => {
    const result = buildEdgeClipPath('slant-b', 'flat', 15, 0)
    expect(result).toContain('polygon')
  })

  it('handles both slanted edges', () => {
    const result = buildEdgeClipPath('slant-a', 'slant-b', 20, 20)
    expect(result).toContain('polygon')
  })
})

describe('buildCornerCutCss', () => {
  it('returns empty polygon for no cuts', () => {
    const cuts = { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } }
    const result = buildCornerCutCss(cuts, 'none')
    expect(result).toContain('0 0')
  })

  it('builds left chamfer', () => {
    const cuts = { tl: { x: 5, y: 5 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 5, y: 5 } }
    const result = buildCornerCutCss(cuts, 'left')
    expect(result).toContain('polygon')
    expect(result).toContain('5px')
  })

  it('builds right chamfer', () => {
    const cuts = { tl: { x: 0, y: 0 }, tr: { x: 5, y: 5 }, br: { x: 5, y: 5 }, bl: { x: 0, y: 0 } }
    const result = buildCornerCutCss(cuts, 'right')
    expect(result).toContain('polygon')
  })

  it('builds both chamfer', () => {
    const cuts = { tl: { x: 5, y: 5 }, tr: { x: 5, y: 5 }, br: { x: 5, y: 5 }, bl: { x: 5, y: 5 } }
    const result = buildCornerCutCss(cuts, 'both')
    expect(result).toContain('polygon')
  })

  it('ignores x-only cuts', () => {
    const cuts = { tl: { x: 5, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 5 } }
    const result = buildCornerCutCss(cuts, 'left')
    expect(result).toContain('0 0')
  })

  it('ignores y-only cuts', () => {
    const cuts = { tl: { x: 0, y: 5 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 5, y: 0 } }
    const result = buildCornerCutCss(cuts, 'left')
    expect(result).toContain('0 0')
  })
})

describe('buildShapeCss', () => {
  const baseShape: BarShape = {
    leftEdge: 'flat',
    rightEdge: 'flat',
    edgeDepth: 10,
    chamferMode: 'none',
    borderRadius: { tl: 3, tr: 3, br: 3, bl: 3 },
    cornerCuts: { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } },
    outline: { color: '#000000', thickness: { top: 0, right: 0, bottom: 0, left: 0 } },
  }

  it('returns basic shape with border radius', () => {
    const result = buildShapeCss(baseShape)
    expect(result.borderRadius).toBe('3px 3px 3px 3px')
  })

  it('adds clip-path for chamfer mode', () => {
    const shape: BarShape = {
      ...baseShape,
      chamferMode: 'both',
      cornerCuts: { tl: { x: 5, y: 5 }, tr: { x: 5, y: 5 }, br: { x: 5, y: 5 }, bl: { x: 5, y: 5 } },
    }
    const result = buildShapeCss(shape)
    expect(result.clipPath).toContain('polygon')
  })

  it('adds clip-path for non-flat edges', () => {
    const shape: BarShape = { ...baseShape, leftEdge: 'slant-a', rightEdge: 'flat', edgeDepth: 15 }
    const result = buildShapeCss(shape)
    expect(result.clipPath).toContain('polygon')
  })

  it('skips clip-path when edges are flat', () => {
    const shape: BarShape = { ...baseShape, leftEdge: 'flat', rightEdge: 'flat' }
    const result = buildShapeCss(shape)
    expect(result.clipPath).toBeUndefined()
  })
})

describe('buildOutlineCss', () => {
  it('returns empty for all zero thickness', () => {
    const outline: BarOutline = { color: '#000', thickness: { top: 0, right: 0, bottom: 0, left: 0 } }
    const result = buildOutlineCss(outline)
    expect(result).toEqual({})
  })

  it('builds top inset shadow', () => {
    const outline: BarOutline = { color: '#fff', thickness: { top: 2, right: 0, bottom: 0, left: 0 } }
    const result = buildOutlineCss(outline)
    expect(result.boxShadow).toContain('inset 0 2px 0')
  })

  it('builds bottom inset shadow', () => {
    const outline: BarOutline = { color: '#fff', thickness: { top: 0, right: 0, bottom: 2, left: 0 } }
    const result = buildOutlineCss(outline)
    expect(result.boxShadow).toContain('inset 0 -2px 0')
  })

  it('builds left inset shadow', () => {
    const outline: BarOutline = { color: '#fff', thickness: { top: 0, right: 0, bottom: 0, left: 2 } }
    const result = buildOutlineCss(outline)
    expect(result.boxShadow).toContain('inset 2px 0 0')
  })

  it('builds right inset shadow', () => {
    const outline: BarOutline = { color: '#fff', thickness: { top: 0, right: 2, bottom: 0, left: 0 } }
    const result = buildOutlineCss(outline)
    expect(result.boxShadow).toContain('inset -2px 0 0')
  })

  it('combines multiple shadows', () => {
    const outline: BarOutline = { color: '#fff', thickness: { top: 1, right: 1, bottom: 1, left: 1 } }
    const result = buildOutlineCss(outline)
    expect(result.boxShadow).toContain(',')
  })
})

describe('buildGradientAnimationCss', () => {
  it('returns empty when no animation', () => {
    const gradient: GradientFill = {
      type: 'linear',
      stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }],
    }
    const result = buildGradientAnimationCss(gradient)
    expect(result).toEqual({})
  })

  it('returns empty when animation disabled', () => {
    const gradient: GradientFill = {
      type: 'linear',
      stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }],
      animation: { enabled: false },
    }
    const result = buildGradientAnimationCss(gradient)
    expect(result).toEqual({})
  })

  it('builds angle rotation animation', () => {
    const gradient: GradientFill = {
      type: 'linear',
      stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }],
      animation: {
        enabled: true,
        angleRotation: 'continuous',
        angleRotationSpeed: 5,
        angleRotationDirection: 'clockwise',
        scrollDirection: 'none',
        shimmerEnabled: false,
      },
    }
    const result = buildGradientAnimationCss(gradient)
    expect(result.animation).toContain('gradientAngleSpin')
  })

  it('builds scroll animation', () => {
    const gradient: GradientFill = {
      type: 'linear',
      stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }],
      animation: {
        enabled: true,
        angleRotation: 'none',
        scrollDirection: 'to-right',
        scrollSpeed: 3,
        shimmerEnabled: false,
      },
    }
    const result = buildGradientAnimationCss(gradient)
    expect(result.animation).toContain('gradientScrollX')
  })

  it('builds shimmer animation', () => {
    const gradient: GradientFill = {
      type: 'linear',
      stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }],
      animation: {
        enabled: true,
        angleRotation: 'none',
        scrollDirection: 'none',
        shimmerEnabled: true,
        shimmerSpeed: 2,
        shimmerWidth: 25,
      },
    }
    const result = buildGradientAnimationCss(gradient)
    expect(result.animation).toContain('shimmerMove')
    expect(result['--shimmer-width']).toBe('25%')
  })

  it('combines animations', () => {
    const gradient: GradientFill = {
      type: 'linear',
      stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }],
      animation: {
        enabled: true,
        angleRotation: 'oscillate',
        angleRotationSpeed: 4,
        angleRotationDirection: 'clockwise',
        scrollDirection: 'to-right',
        scrollSpeed: 5,
        shimmerEnabled: false,
      },
    }
    const result = buildGradientAnimationCss(gradient)
    expect(result.animation).toContain(',')
  })
})
