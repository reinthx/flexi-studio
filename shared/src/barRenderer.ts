import type { BarLabel, BarStyle, Orientation, Profile } from './configSchema'
import { formatValue } from './formatValue'
import type { BarData } from './useBarStyles'

export interface FlexiBarRank1Config {
  rank1HeightIncrease?: number
  rank1Glow?: { enabled: boolean; color: string; blur: number }
  rank1ShowCrown?: boolean
  rank1Crown?: {
    enabled: boolean
    icon: string
    imageUrl?: string
    size: number
    offsetX: number
    offsetY: number
    rotation?: number
    hAnchor: 'left' | 'right' | 'center'
    vAnchor: 'top' | 'middle' | 'bottom'
  }
  rank1NameStyle?: {
    enabled: boolean
    gradient?: {
      type: 'linear' | 'radial'
      angle: number
      stops: Array<{ color: string; position: number }>
    }
  }
  rank1IconStyle?: {
    enabled: boolean
    glow?: { enabled: boolean; color: string; blur: number }
    shadow?: { enabled: boolean; color: string; blur: number }
    bgShape?: {
      enabled: boolean
      shape: 'circle' | 'square' | 'rounded' | 'diamond'
      color: string
      size: number
      opacity: number
      offsetX: number
      offsetY: number
    }
  }
}

export interface FlexiBarProps {
  bar: BarData
  styleConfig: BarStyle
  orientation: Orientation
  showRank: boolean
  blurName?: boolean
  clickable?: boolean
  validateStyle?: boolean
  expandedShadowFilter?: boolean
  containerHeight?: number
  autoScale?: boolean
  barIndex?: number
  valueFormat?: 'raw' | 'abbreviated' | 'formatted'
  tabLabelConfig?: BarLabel
  rank1Config?: FlexiBarRank1Config
  colorOverrides?: Profile['overrides']
}

export function splitMaxHit(raw: string | undefined, valueFormat: 'raw' | 'abbreviated' | 'formatted' = 'abbreviated'): {
  name: string
  value: string
  combined: string
} {
  if (!raw || raw === '---') return { name: raw ?? '', value: raw ?? '', combined: raw ?? '' }
  const spaceIdx = raw.lastIndexOf(' ')
  const name = spaceIdx < 0 ? '' : raw.slice(0, spaceIdx)
  const numStr = spaceIdx < 0 ? raw : raw.slice(spaceIdx + 1)
  const suffix = numStr.slice(-1).toUpperCase()
  const multipliers: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 }
  const baseStr = multipliers[suffix] ? numStr.slice(0, -1) : numStr
  const baseNum = parseFloat(baseStr.replace(/,/g, ''))
  const value = Number.isNaN(baseNum)
    ? raw
    : formatValue(multipliers[suffix] ? baseNum * multipliers[suffix] : baseNum, valueFormat)
  const combined = !name || name === '---' || !value || value === '---' ? name || value || '' : `${name} ${value}`
  return { name, value, combined }
}

export function percentToken(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed === '---') return trimmed
  return `${trimmed.replace(/%+$/, '')}%`
}

export function buildFlexiBarTokens(
  bar: BarData & { tohit?: string },
  showRank: boolean,
  valueFormat: 'raw' | 'abbreviated' | 'formatted' = 'abbreviated',
): Record<string, string> {
  const maxHit = splitMaxHit(bar.maxHit, valueFormat)
  return {
    name: bar.name,
    job: bar.job,
    rank: showRank ? String(bar.rank) : '',
    Rank: showRank ? String(bar.rank) : '',
    value: bar.displayValue,
    pct: `${bar.displayPct}%`,
    crithit: bar.crithit,
    'crithit%': percentToken(bar.crithit),
    directhit: bar.directhit,
    'directhit%': percentToken(bar.directhit),
    enchps: bar.enchps,
    rdps: bar.rdps,
    tohit: bar.tohit ?? '',
    maxhit: maxHit.combined,
    maxHit: maxHit.combined,
    maxHitName: maxHit.name,
    maxHitValue: maxHit.value,
    death: bar.deaths !== '0' ? `${bar.deaths} deaths` : '',
    icon: bar.job,
  }
}
