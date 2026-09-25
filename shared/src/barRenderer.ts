import type { BarLabel, BarStyle, Orientation, Profile, ValueFormat } from './configSchema'
import { formatValue } from './formatValue'
import { renderTemplate } from './templateRenderer'
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
  /**
   * Measured list-container content width (one ResizeObserver per meter list
   * in the parent). When present, per-bar measurement is skipped. Rows in a
   * vertical list stretch to exactly this width.
   */
  containerWidth?: number
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
    dps: bar.dps,
    encdps: bar.dps,
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

export interface BarFieldLike {
  template: string
  valueFormat?: string
}

export interface BarRawValues {
  rawValue?: number
  rawDps?: number
  rawEnchps?: number
  rawRdps?: number
}

/**
 * Cache key over every text-visible input of buildFlexiBarTokens.
 * Deliberately excludes fillFraction, alpha, metricFractions, and raw*
 * values: tokens stay identical while bars glide, so per-frame rebuilds
 * can be skipped by comparing this key.
 */
export function buildTokenCacheKey(
  bar: BarData & { tohit?: string },
  showRank: boolean,
  valueFormat: 'raw' | 'abbreviated' | 'formatted' = 'abbreviated',
): string {
  return [
    bar.name, bar.job, bar.rank, showRank ? '1' : '0', valueFormat,
    bar.displayValue, bar.displayPct, bar.dps, bar.enchps, bar.rdps,
    bar.crithit, bar.directhit, bar.tohit ?? '', bar.maxHit, bar.deaths,
  ].join('\u0000')
}

function metricAwareValue(template: string, fmt: ValueFormat, raw: BarRawValues): string | undefined {
  const lower = template.toLowerCase()
  if (!template.includes('{value}')) return undefined
  if (lower.includes('rdps')) return formatValue(raw.rawRdps ?? raw.rawValue ?? 0, fmt)
  if (lower.includes('dps') && !lower.includes('rdps')) return formatValue(raw.rawDps ?? raw.rawValue ?? 0, fmt)
  return undefined
}

/**
 * Render one label field to text. Pure counterpart of FlexiBar's fieldText:
 * per-field valueFormat overrides re-resolve the metric tokens, otherwise
 * the shared token map is reused.
 */
export function renderBarFieldText(
  field: BarFieldLike,
  tokens: Record<string, string>,
  raw: BarRawValues,
  valueFormat: 'raw' | 'abbreviated' | 'formatted' = 'abbreviated',
): string {
  const tpl = field.template.replace('{icon}', '').trim()
  const fmt = (field.valueFormat ?? valueFormat) as ValueFormat
  const metricValue = metricAwareValue(field.template, fmt, raw)
  if (field.valueFormat && field.valueFormat !== valueFormat) {
    const nextTokens = { ...tokens }
    nextTokens.value = metricValue ?? formatValue(raw.rawValue ?? 0, fmt)
    nextTokens.dps = formatValue(raw.rawDps ?? 0, fmt)
    nextTokens.encdps = nextTokens.dps
    nextTokens.enchps = formatValue(raw.rawEnchps ?? 0, fmt)
    nextTokens.rdps = formatValue(raw.rawRdps ?? 0, fmt)
    return renderTemplate(tpl, nextTokens)
  }
  if (metricValue !== undefined) {
    return renderTemplate(tpl, { ...tokens, value: metricValue })
  }
  return renderTemplate(tpl, tokens)
}
