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
})
