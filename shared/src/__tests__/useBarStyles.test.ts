import { describe, expect, it } from 'vitest'
import type { BarStyle, Profile } from '../configSchema'
import { DEFAULT_STYLE, type BarData, useBarStyles } from '../useBarStyles'

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
    enchps: '0',
    rdps: '900',
    rawValue: 1000,
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
      width: '50%',
      backgroundColor: '#123456',
    })
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
      height: '25%',
      backgroundColor: '#abcdef',
    })
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
    expect(styles.bgShadowStyle.value.filter).toBe('drop-shadow(20px -20px 10px rgba(0,0,0,0.5))')
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
