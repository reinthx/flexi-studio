import { describe, expect, it } from 'vitest'
import type { BarStyle, LabelField, Profile } from '../configSchema'
import {
  DEFAULT_STYLE,
  type BarData,
  buildSegmentStrokePolygons,
  buildShapeStrokePoints,
  calcFieldStyle,
  getFillOpacity,
  lerpColor,
  parseHex,
  parseSvgPoints,
  sampleGradientColor,
  useBarStyles,
} from '../useBarStyles'

function makeStyles(style: BarStyle, barOverrides: Partial<BarData> = {}, rank1Config: any = undefined) {
  return useBarStyles(
    () => bar(barOverrides),
    () => style,
    () => 'vertical',
    () => 0,
    () => undefined,
    rank1Config,
    undefined,
    () => 200,
  )
}

function cloneStyle(): BarStyle {
  return JSON.parse(JSON.stringify(DEFAULT_STYLE)) as BarStyle
}

function bar(overrides: Partial<BarData> = {}): BarData {
  return {
    name: 'Alice',
    job: 'WAR',
    fillFraction: 0.5,
    displayValue: '1000',
    displayPct: '50',
    deaths: '1',
    crithit: '10',
    directhit: '20',
    dps: '1000',
    enchps: '0',
    rdps: '900',
    rawValue: 1000,
    rawDps: 1000,
    rawEnchps: 0,
    rawRdps: 900,
    maxHit: 'Fell Cleave 1000',
    alpha: 1,
    rank: 2,
    ...overrides,
  }
}

describe('useBarStyles', () => {
  it('builds vertical fill styles using the bar fill fraction', () => {
    const style = cloneStyle()
    style.fill = { type: 'solid', color: '#123456' }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.fillStyle.value).toMatchObject({
      position: 'absolute',
      top: '0',
      left: '0',
      bottom: '0',
      right: '0',
      transform: 'scaleX(0.5)',
      transformOrigin: 'left center',
      backgroundColor: '#123456',
    })
    expect(styles.fillStyle.value).not.toHaveProperty('width')
  })

  it('keeps the width path for segment fills (px masks would squash under scale)', () => {
    const style = cloneStyle()
    style.fill = { type: 'solid', color: '#123456' }
    style.shape = {
      ...style.shape,
      segmentFill: { enabled: true, segmentWidth: 8, gap: 2 },
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.fillStyle.value).toMatchObject({ width: '50%' })
    expect(styles.fillStyle.value).not.toHaveProperty('transform')
  })

  it('builds horizontal fill styles from the bottom up', () => {
    const style = cloneStyle()
    style.fill = { type: 'solid', color: '#abcdef' }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.25 }),
      () => style,
      () => 'horizontal',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 160,
    )

    expect(styles.fillStyle.value).toMatchObject({
      bottom: '0',
      left: '0',
      right: '0',
      height: '100%',
      transform: 'scaleY(0.25)',
      transformOrigin: 'center bottom',
      backgroundColor: '#abcdef',
    })
    expect(styles.fillStyle.value).not.toHaveProperty('width')
  })

  it('keeps paginated background textures offset by bar index', () => {
    const style = cloneStyle()
    style.bg = {
      type: 'texture',
      texture: {
        src: 'data:image/png;base64,abc',
        repeat: 'paginate',
        opacity: 1,
        blendMode: 'normal',
        pagination: { enabled: true, startOffsetX: 4, startOffsetY: 6 },
      },
    }
    style.height = 28
    style.gap = 2
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 2,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.bgTextureInnerStyle.value).toMatchObject({
      backgroundRepeat: 'repeat',
      backgroundPosition: '4px -66px',
      backgroundSize: 'auto',
    })
  })

  it('keeps shape-cut paginated backgrounds on the main renderer path', () => {
    const style = cloneStyle()
    style.bg = {
      type: 'texture',
      texture: {
        src: 'data:image/png;base64,abc',
        repeat: 'paginate',
        opacity: 1,
        blendMode: 'normal',
        pagination: { enabled: true, startOffsetX: 4, startOffsetY: 6 },
      },
    }
    style.shape = {
      ...style.shape,
      rightEdge: 'slant-a',
      edgeDepth: 16,
    }
    style.height = 28
    style.gap = 2
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 2,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.useSvgShape.value).toBe(true)
    expect(styles.bgStyle.value).not.toHaveProperty('display', 'none')
    expect(styles.shapeSvgBgStyle.value).toBeUndefined()
    expect(styles.bgTextureInnerStyle.value).toMatchObject({
      backgroundRepeat: 'repeat',
      backgroundPosition: '4px -66px',
      backgroundSize: 'auto',
    })
  })

  it('renders fill outline even when background stroke is enabled', () => {
    const style = cloneStyle()
    style.shape = {
      ...style.shape,
      bgStroke: { enabled: true, color: '#000000', width: 1 },
      outline: {
        color: '#ffffff',
        target: 'fill',
        thickness: { top: 1, right: 1, bottom: 1, left: 1 },
      },
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.fillStyle.value.boxShadow).toContain('inset 0 1px 0 #ffffff')
    expect(styles.bgStyle.value.boxShadow).toBe('inset 0 0 0 1px #000000')
  })

  it('keeps the fill clipped to the configured bar shape', () => {
    const style = cloneStyle()
    style.shape = {
      ...style.shape,
      rightEdge: 'slant-a',
      edgeDepth: 16,
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.fillStyle.value.clipPath).toBe(styles.shapeCss.value.clipPath)
    expect(styles.shapeSvgFillBox.value).toBeUndefined()
  })

  it('uses the measured bar width for shape-cut geometry', () => {
    const style = cloneStyle()
    style.shape = {
      ...style.shape,
      rightEdge: 'slant-a',
      edgeDepth: 16,
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 344,
    )

    expect(styles.useSvgShape.value).toBe(true)
    expect(styles.shapeSvgViewBox.value).toBe('0 0 344 28')
    expect(styles.shapeSvgPoints.value).toContain('344,0')
  })

  it('keeps fill shadow active for svg-backed non-rect shapes', () => {
    const style = cloneStyle()
    style.shape = {
      ...style.shape,
      leftEdge: 'point',
      edgeDepth: 12,
      fillShadow: { enabled: true, color: 'rgba(255,255,255,0.6)', blur: 4, thickness: 2, offsetX: 0, offsetY: 0 },
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.useSvgShape.value).toBe(true)
    expect(styles.fillShadowBoundsStyle.value).not.toHaveProperty('display', 'none')
    expect(styles.fillShadowWrapStyle.value.filter).toBe('drop-shadow(0px 0px 6px rgba(255,255,255,0.6))')
  })

  it('does not render the clipped black shadow source when shape shadow is disabled', () => {
    const style = cloneStyle()
    style.bg = { type: 'solid', color: '#111111', opacity: 0 }
    style.fill = { type: 'solid', color: '#222222', opacity: 0 }
    style.shape = {
      ...style.shape,
      rightEdge: 'slant-a',
      edgeDepth: 16,
      shadow: { enabled: false, color: '#000000', blur: 10, thickness: 0, offsetX: 0, offsetY: 0 },
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.isClipped.value).toBe(true)
    expect(styles.bgStyle.value).toMatchObject({ display: 'none' })
    expect(styles.fillStyle.value).toMatchObject({ display: 'none' })
    expect(styles.bgShadowSourceStyle.value).toBeUndefined()
  })

  it('keeps offset background shadow active for svg-backed non-rect shapes', () => {
    const style = cloneStyle()
    style.shape = {
      ...style.shape,
      rightEdge: 'slant-a',
      edgeDepth: 16,
      shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', blur: 10, thickness: 0, offsetX: 20, offsetY: -20 },
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.useSvgShape.value).toBe(true)
    expect(styles.bgShadowDirectionalClip.value).not.toHaveProperty('display', 'none')
    expect(styles.bgShadowDirectionalClip.value.clipPath).toBe('inset(-9999px -9999px 0px 0px)')
    expect(styles.bgShadowStyle.value).not.toHaveProperty('filter')
    expect(styles.bgShadowSvgStyle.value).toMatchObject({
      position: 'absolute',
      inset: '0',
      overflow: 'visible',
    })
    expect(styles.bgShadowSvgFilterAttrs.value).toMatchObject({
      x: '-10000',
      y: '-10000',
      width: '20000',
      height: '20000',
      filterUnits: 'userSpaceOnUse',
    })
    expect(styles.bgShadowSvgDropShadowAttrs.value).toMatchObject({
      dx: '20',
      dy: '-20',
      stdDeviation: '10',
      floodColor: 'rgba(0,0,0,0.5)',
    })
    expect(styles.bgShadowSvgMaskAttrs.value).toMatchObject({
      x: '-10000',
      y: '-10000',
      width: '20000',
      height: '20000',
      maskUnits: 'userSpaceOnUse',
    })
  })

  it('applies job and self label color overrides to processed fields', () => {
    const style = cloneStyle()
    style.label = {
      ...style.label,
      fields: [
        {
          id: 'name',
          template: '{name}',
          hAnchor: 'left',
          vAnchor: 'middle',
          offsetX: 0,
          offsetY: 0,
          enabled: true,
          colorMode: 'job',
        },
        {
          id: 'self',
          template: '{value}',
          hAnchor: 'right',
          vAnchor: 'middle',
          offsetX: 0,
          offsetY: 0,
          enabled: true,
          colorMode: 'role',
          selfMode: true,
        },
      ],
    }
    const overrides: Profile['overrides'] = {
      byJobEnabled: { WAR: true },
      byRoleEnabled: { tank: true },
      byJob: { WAR: { fill: { type: 'solid', color: '#ff0000' } } },
      byRole: { tank: { fill: { type: 'solid', color: '#00ff00' } } },
      selfEnabled: true,
      self: { fill: { type: 'solid', color: '#0000ff' } },
    }
    const styles = useBarStyles(
      () => bar({ isSelf: true }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      () => overrides,
      () => 200,
    )

    expect(styles.processedFields.value[0].style.color).toBe('#ff0000')
    expect(styles.processedFields.value[1].style.color).toBe('#0000ff')
  })

  it('does not clip label fields before text outline and shadow can render', () => {
    const style = cloneStyle()
    style.label = {
      ...style.label,
      outline: { enabled: true, color: '#000000', width: 3 },
      fields: [
        {
          id: 'name',
          template: '{name}',
          hAnchor: 'left',
          vAnchor: 'middle',
          offsetX: 0,
          offsetY: 0,
          rotation: 8,
          enabled: true,
        },
      ],
    }
    const styles = useBarStyles(
      () => bar({ fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      undefined,
      undefined,
      () => 200,
    )

    expect(styles.processedFields.value[0].style.overflow).toBe('visible')
    expect(styles.processedFields.value[0].style).not.toHaveProperty('textOverflow')
    expect(styles.labelOutlineShadow.value).toContain('3px 0px 0 #000000')
  })

  it('enables death and rank-one presentation computed styles only when configured', () => {
    const style = cloneStyle()
    style.label = {
      ...style.label,
      separateRowDeaths: true,
      deathSize: 18,
      deathOpacity: 0.8,
    }
    const styles = useBarStyles(
      () => bar({ rank: 1, deaths: '2' }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      () => ({
        rank1HeightIncrease: 25,
        rank1Glow: { enabled: true, color: '#ffd700', blur: 6 },
        rank1ShowCrown: true,
        rank1Crown: {
          enabled: true,
          icon: '*',
          size: 20,
          offsetX: 2,
          offsetY: 0,
          hAnchor: 'left',
          vAnchor: 'middle',
        },
      }),
      undefined,
      () => 200,
    )

    expect(styles.showDeath.value).toBe(true)
    expect(styles.deathText.value).toBe('💀2')
    expect(styles.deathStyle.value).toMatchObject({ fontSize: '18px', opacity: '0.8' })
    expect(styles.rank1HeightAdjustment.value).toBe(7)
    expect(styles.rank1ZIndex.value).toBe(10)
    expect(styles.rank1GlowStyle.value).toEqual({ filter: 'drop-shadow(0 0 6px #ffd700)' })
    expect(styles.rank1ShowCrown.value).toBe(true)
    expect(styles.rank1CrownIcon.value).toBe('*')
  })

  it('applies rank-one icon presentation options', () => {
    const style = cloneStyle()
    const styles = useBarStyles(
      () => bar({ rank: 1, fillFraction: 0.5 }),
      () => style,
      () => 'vertical',
      () => 0,
      () => undefined,
      () => ({
        rank1IconStyle: {
          enabled: true,
          glow: { enabled: true, color: '#ffd700', blur: 9 },
          shadow: { enabled: true, color: '#111111', blur: 4 },
          bgShape: {
            enabled: true,
            shape: 'diamond',
            color: '#123456',
            size: 30,
            opacity: 0.75,
            offsetX: 3,
            offsetY: -2,
          },
        },
      }),
      undefined,
      () => 200,
    )

    expect(styles.iconImageStyle.value.filter).toContain('drop-shadow(0 0 9px #ffd700)')
    expect(styles.iconImageStyle.value.filter).toContain('drop-shadow(0 0 4px #111111)')
    expect(styles.iconBgStyle.value).toMatchObject({
      background: '#123456',
      opacity: '0.75',
    })
    expect(styles.iconBgDiamondStyle.value).toMatchObject({
      transform: 'translate(3px, -2px) rotate(45deg)',
      width: '30px',
      height: '30px',
    })
  })
})

describe('gradient color sampling', () => {
  const stops = (colors: string[]) => ({
    type: 'linear' as const,
    angle: 90,
    stops: colors.map((color, i) => ({ color, position: i / (colors.length - 1) })),
  })

  it('parses short and full hex colors', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('#123456')).toEqual([18, 52, 86])
  })

  it('lerps between endpoint colors', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('rgb(0,0,0)')
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('rgb(255,255,255)')
    expect(lerpColor('#ff0000', '#0000ff', 0.5)).toBe('rgb(128,0,128)')
  })

  it('samples stops with clamping and sorting', () => {
    expect(sampleGradientColor({ type: 'linear', angle: 0, stops: [] }, 0.5)).toBe('#000')
    expect(sampleGradientColor(stops(['#ff0000']), 0.9)).toBe('#ff0000')
    expect(sampleGradientColor(stops(['#ff0000', '#0000ff']), -1)).toBe('#ff0000')
    expect(sampleGradientColor(stops(['#ff0000', '#0000ff']), 2)).toBe('#0000ff')
    expect(sampleGradientColor(stops(['#ff0000', '#0000ff']), 0.5)).toBe('rgb(128,0,128)')
    // Unsorted stops are ordered before sampling.
    const unsorted = {
      type: 'linear' as const,
      angle: 0,
      stops: [
        { color: '#0000ff', position: 1 },
        { color: '#ff0000', position: 0 },
      ],
    }
    expect(sampleGradientColor(unsorted, 0)).toBe('#ff0000')
  })
})

describe('fill opacity', () => {
  it('resolves texture, solid, and missing fills', () => {
    expect(getFillOpacity(undefined)).toBe(1)
    expect(getFillOpacity({ type: 'solid', color: '#fff' })).toBe(1)
    expect(getFillOpacity({ type: 'solid', color: '#fff', opacity: 0.4 })).toBe(0.4)
    expect(getFillOpacity({ type: 'texture', texture: { src: 'x', repeat: 'stretch', opacity: 0.7, blendMode: 'normal' } })).toBe(0.7)
  })
})

describe('label field style', () => {
  const field = (partial: Partial<LabelField> = {}): LabelField => ({
    id: 'f1',
    template: '{name}',
    hAnchor: 'left',
    vAnchor: 'middle',
    offsetX: 0,
    offsetY: 0,
    enabled: true,
    ...partial,
  })

  it('anchors left fields with padding and offsets', () => {
    const style = calcFieldStyle(field(), 4, 0, cloneStyle(), 200)
    expect(style).toMatchObject({ position: 'absolute', left: '4px', top: '50%' })
    expect(String(style.transform)).toContain('translateY(calc(-50% + 0px))')
  })

  it('right-anchors with translateX by default and caps max width', () => {
    const style = calcFieldStyle(field({ hAnchor: 'right', maxWidth: 100 }), 4, 1, cloneStyle(), 200)
    expect(style.maxWidth).toBe('100px')
    expect(String(style.transform)).toContain('translateX(-100%)')
  })

  it('applies font, size, opacity, and explicit rotation', () => {
    const style = calcFieldStyle(
      field({ font: 'Arial', fontSize: 14, opacity: 0.5, rotation: 90 }),
      4,
      0,
      cloneStyle(),
      200,
    )
    expect(style).toMatchObject({
      fontFamily: 'Arial',
      fontSize: '14px',
      opacity: '0.5',
      transformOrigin: '0% 100%',
    })
    expect(String(style.transform)).toContain('rotate(90deg)')
  })
})

describe('shape stroke geometry', () => {
  it('parses svg point lists', () => {
    expect(parseSvgPoints('0,0 10,0 10,5')).toEqual([[0, 0], [10, 0], [10, 5]])
  })

  it('returns no stroke for flat shapes', () => {
    expect(buildShapeStrokePoints(cloneStyle().shape, 200, 28)).toBeUndefined()
  })

  it('builds segment polygons for enabled segment fills', () => {
    const shape = {
      ...cloneStyle().shape,
      leftEdge: 'slant-a' as const,
      edgeDepth: 12,
      segmentFill: { enabled: true, segmentWidth: 8, gap: 2 },
    }
    const polygons = buildSegmentStrokePolygons(shape, 200, 28)
    expect(polygons.length).toBeGreaterThan(0)
    expect(polygons[0].key).toBe('segment-0')
    expect(polygons[0].points).toContain(',')
  })

  it('returns no segments when segment fill is disabled', () => {
    expect(buildSegmentStrokePolygons(cloneStyle().shape, 200, 28)).toEqual([])
  })
})

describe('shape-cut fill clipping', () => {
  it('clips the fill to the shape path on cut bars', () => {
    const style = cloneStyle()
    style.shape = { ...style.shape, rightEdge: 'slant-a', edgeDepth: 16 }
    const styles = makeStyles(style)

    expect(String(styles.fillStyle.value.clipPath)).toContain('polygon')
  })

  it('leaves flat bars unclipped', () => {
    const styles = makeStyles(cloneStyle())
    expect(styles.fillStyle.value.clipPath).toBeUndefined()
  })
})

describe('label text effects', () => {
  it('builds gradient text backgrounds', () => {
    const gradient = {
      type: 'linear' as const,
      angle: 90,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#00ff00', position: 1 },
      ],
    }
    const style = cloneStyle()
    style.label = { ...style.label, gradient }
    const styles = makeStyles(style)

    expect(styles.gradientTextStyle.value).toMatchObject({
      background: 'linear-gradient(90deg, #ff0000 0.0%, #00ff00 100.0%)',
      WebkitTextFillColor: 'transparent',
    })

    const radial = cloneStyle()
    radial.label = { ...radial.label, gradient: { ...gradient, type: 'radial' as const } }
    expect(makeStyles(radial).gradientTextStyle.value?.background).toContain('radial-gradient')
    expect(makeStyles(cloneStyle()).gradientTextStyle.value).toBeUndefined()
  })

  it('builds 8-way label outlines and drop-shadow text', () => {
    const style = cloneStyle()
    style.label = {
      ...style.label,
      outline: { enabled: true, color: '#ff0000', width: 2, gradient: null },
      shadow: { enabled: true, color: '#000000', blur: 3, offsetX: 1, offsetY: 2, thickness: 1 },
    }
    const styles = makeStyles(style)

    expect(styles.labelOutlineShadow.value.split(', ')).toHaveLength(8)
    expect(styles.labelOutlineShadow.value).toContain('#ff0000')
    expect(styles.textStyle.value).toBe('drop-shadow(1px 2px 3px #000000)')

    const plain = makeStyles(cloneStyle())
    expect(plain.textStyle.value).toBe('drop-shadow(0px 1px 2px #000000)')
  })

  it('samples gradient outline colors around the ring', () => {
    const style = cloneStyle()
    style.label = {
      ...style.label,
      outline: {
        enabled: true,
        color: '#000000',
        width: 1,
        gradient: {
          type: 'linear',
          angle: 0,
          stops: [
            { color: '#ff0000', position: 0 },
            { color: '#0000ff', position: 1 },
          ],
        },
      },
    }
    expect(makeStyles(style).labelOutlineShadow.value).toContain('rgb(')
  })
})

describe('death indicator', () => {
  it('shows positioned death marks for separate-row deaths', () => {
    const style = cloneStyle()
    style.label = { ...style.label, separateRowDeaths: true, deathOffsetX: 3, deathSize: 14 }
    const styles = makeStyles(style, { deaths: '2' })

    expect(styles.showDeath.value).toBe(true)
    expect(styles.deathText.value).toBe('💀2')
    expect(styles.deathStyle.value).toMatchObject({
      position: 'absolute',
      fontSize: '14px',
    })
    expect(String(styles.deathStyle.value.transform)).toContain('3px')
  })

  it('hides the indicator without deaths or separate rows', () => {
    expect(makeStyles(cloneStyle(), { deaths: '0' }).showDeath.value).toBe(false)
    expect(makeStyles(cloneStyle(), { deaths: '2' }).showDeath.value).toBe(false)
    expect(makeStyles(cloneStyle(), { deaths: '0' }).deathText.value).toBe('')
  })
})

describe('job icon sizing', () => {
  it('derives icon size from label size with overrides and LB shrink', () => {
    const style = cloneStyle()
    style.label = { ...style.label, size: 10 }
    expect(makeStyles(style).iconSize.value).toBe(14)

    const overridden = cloneStyle()
    overridden.label = { ...overridden.label, size: 10, iconConfig: { ...overridden.label.iconConfig, sizeOverride: 24 } }
    expect(makeStyles(overridden).iconSize.value).toBe(24)

    expect(makeStyles(cloneStyle(), { job: 'LB' }).iconSize.value).toBe(Math.round(17 * 0.68))
  })

  it('hides icons and containers per config', () => {
    const hidden = cloneStyle()
    hidden.label = { ...hidden.label, iconConfig: { ...hidden.label.iconConfig, show: false } }
    expect(makeStyles(hidden).showIcon.value).toBe(false)
    expect(makeStyles(cloneStyle()).showIcon.value).not.toBe(false)

    expect(makeStyles(cloneStyle()).iconContainerStyle.value).toBeUndefined()
    const offset = cloneStyle()
    offset.label = { ...offset.label, iconConfig: { ...offset.label.iconConfig, offsetX: 5 } }
    expect(makeStyles(offset).iconContainerStyle.value).toMatchObject({
      transform: 'translate(5px, 0px)',
    })
  })
})

describe('metric strip', () => {
  it('renders fractional widths for enabled strips', () => {
    const style = cloneStyle()
    style.metricStrip = { ...(style.metricStrip ?? {}), enabled: true } as any
    const styles = makeStyles(style, { fillFraction: 0.5 })

    expect(styles.metricStripStyle.value).toMatchObject({
      width: '100%',
      transform: 'scaleX(0.5)',
      transformOrigin: 'left center',
    })
  })

  it('stays hidden when disabled', () => {
    expect(makeStyles(cloneStyle()).metricStripStyle.value).toBeUndefined()
  })
})

describe('rank 1 accents', () => {
  const rank1 = (extra: any = {}) =>
    makeStyles(cloneStyle(), { rank: 1 }, {
      rank1Glow: { enabled: true, color: '#FFD700', blur: 8 },
      ...extra,
    })

  it('glows the top bar only', () => {
    expect(rank1().rank1GlowStyle.value).toMatchObject({
      filter: 'drop-shadow(0 0 8px #FFD700)',
    })
    expect(makeStyles(cloneStyle(), { rank: 2 }, {
      rank1Glow: { enabled: true, color: '#FFD700', blur: 8 },
    }).rank1GlowStyle.value).toBeUndefined()
  })

  it('gradients the top name only', () => {
    const gradient = {
      enabled: true,
      gradient: {
        type: 'linear' as const,
        angle: 90,
        stops: [
          { color: '#ff0000', position: 0 },
          { color: '#00ff00', position: 1 },
        ],
      },
    }
    expect(rank1({ rank1NameStyle: gradient }).rank1NameGradientStyle.value?.background)
      .toContain('linear-gradient(90deg')
    expect(makeStyles(cloneStyle(), { rank: 2 }, {
      rank1NameStyle: gradient,
    }).rank1NameGradientStyle.value).toBeUndefined()
  })
})

describe('texture fill inner sizing', () => {
  it('sizes texture inners to the full bar and skips solid fills', () => {
    const texture = cloneStyle()
    texture.fill = {
      type: 'texture',
      texture: { src: 'x', repeat: 'stretch', opacity: 1, blendMode: 'normal' },
    }
    expect(makeStyles(texture).fillTextureInnerStyle.value).toBeDefined()
    expect(makeStyles(cloneStyle()).fillTextureInnerStyle.value).toBeUndefined()
  })

  it('counter-scales the texture inner against the transformed parent', () => {
    const texture = cloneStyle()
    texture.fill = {
      type: 'texture',
      texture: { src: 'x', repeat: 'stretch', opacity: 1, blendMode: 'normal' },
    }
    const styles = makeStyles(texture, { fillFraction: 0.5 })
    expect(styles.fillStyle.value).toMatchObject({ transform: 'scaleX(0.5)' })
    expect(styles.fillTextureInnerStyle.value).toMatchObject({
      width: '100%',
      transform: 'scaleX(2)',
      transformOrigin: 'left center',
    })
  })
})
