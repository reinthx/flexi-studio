export const METRIC_STRIP_SOURCES = ['encdps', 'enchps', 'dtps', 'rdps', 'damage%', 'healed%', 'crithit%', 'threat'] as const

export type MetricFractionSource = typeof METRIC_STRIP_SOURCES[number]
export type CombatantMetricRecord = Record<string, string | undefined>

export interface MetricFractionContext {
  maxBySource: Record<MetricFractionSource, number>
}

export function parseMetricNumber(value: string | undefined): number {
  const parsed = parseFloat(value ?? '0')
  return Number.isFinite(parsed) ? parsed : 0
}

export function getMetricValue(combatant: CombatantMetricRecord, source: MetricFractionSource): number {
  if (source === 'dtps') {
    const duration = parseMetricNumber(combatant['DURATION'])
    return duration > 0 ? parseMetricNumber(combatant.damagetaken) / duration : 0
  }
  if (source === 'threat') {
    return parseMetricNumber(combatant['threat%'] ?? combatant['Threat%'] ?? combatant.threat ?? combatant.Threat)
  }
  return parseMetricNumber(combatant[source])
}

export function createMetricFractionContext(combatants: CombatantMetricRecord[]): MetricFractionContext {
  const maxBySource = Object.fromEntries(
    METRIC_STRIP_SOURCES.map(source => [
      source,
      Math.max(...combatants.map(combatant => getMetricValue(combatant, source)), 0) || 1,
    ]),
  ) as Record<MetricFractionSource, number>

  return { maxBySource }
}

export function buildMetricFractions(context: MetricFractionContext, combatant: CombatantMetricRecord): Record<string, number> {
  const fractions: Record<string, number> = {}
  for (const source of METRIC_STRIP_SOURCES) {
    const raw = getMetricValue(combatant, source)
    const isPercentMetric =
      source === 'damage%' ||
      source === 'healed%' ||
      source === 'crithit%' ||
      (source === 'threat' && !!(combatant['threat%'] || combatant['Threat%']))

    const divisor = isPercentMetric ? 100 : context.maxBySource[source]
    fractions[source] = Math.max(0, Math.min(1, raw / divisor))
  }
  return fractions
}
