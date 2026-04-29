import type { DeathRecord, DpsTimeline } from '@shared/configSchema'
import { TIMELINE_BUCKET_SEC } from '@shared/configSchema'

export type OverviewTimelineBar = { key: string; height: string; label: string; value: string; bucket: number }
export type PullGroupDpsBar = { key: string; bucket: number; height: string; value: number; label: string; deathCount: number; raiseCount: number }
export type ChartMetric = 'dps' | 'rdps' | 'hps' | 'dtps'
export type TimelineChartSeries = { name: string; color: string; values: number[]; isGroup: boolean; isFocused: boolean }
export type TimelineChartModel = {
  series: TimelineChartSeries[]
  maxBuckets: number
  maxDps: number
  points: (values: number[]) => string
  yTicks: Array<{ y: number; label: string }>
  xTicks: Array<{ x: number; label: string }>
}

export const CHART_COLORS = ['#ff7675','#74b9ff','#55efc4','#fdcb6e','#a29bfe','#fd79a8','#00cec9','#e17055']
export const GROUP_NAME = '__group__'
export const GROUP_COLOR = 'rgba(255,255,255,0.7)'
export const METRIC_LABELS: Record<ChartMetric, string> = { dps: 'DPS', rdps: 'rDPS', hps: 'HPS', dtps: 'DTPS' }

const avg = (values: number[]) => values.reduce((sum, item) => sum + item, 0) / Math.max(values.length, 1)
const pctHeight = (value: number, max: number, min: number) => `${Math.max(min, Math.min(100, (value / max) * 100)).toFixed(1)}%`

export function topTimelineSpikes(values: number[]) {
  return values.map(value => value / TIMELINE_BUCKET_SEC).map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value).slice(0, 3)
}

export function smoothBuckets(buckets: number[], win = 4): number[] {
  return buckets.map((_, index) => {
    const slice = buckets.slice(Math.max(0, index - win + 1), index + 1)
    return avg(slice)
  })
}

export function buildTimelineChartModel(
  timeline: DpsTimeline,
  options: {
    showEnemies: boolean
    isEnemy: (name: string) => boolean
    selected: string
    hiddenSeries: Set<string>
    formatValue: (value: number, style: 'abbreviated') => string
    geometry: { pl: number; pt: number; cw: number; ch: number }
  },
): TimelineChartModel | null {
  const names = Object.keys(timeline)
  if (names.length === 0) return null
  const maxBuckets = Math.max(...names.map(name => (timeline[name] ?? []).length))
  if (maxBuckets < 2) return null

  const series = names
    .filter(name => options.showEnemies || !options.isEnemy(name))
    .sort((a, b) => a === options.selected ? -1 : b === options.selected ? 1 : a.localeCompare(b))
    .map((name, index) => ({
      name,
      color: CHART_COLORS[index % CHART_COLORS.length],
      values: smoothBuckets(timeline[name] ?? []).map(value => value / TIMELINE_BUCKET_SEC),
      isGroup: false,
      isFocused: name === options.selected,
    }))

  const groupBuckets = Array(maxBuckets).fill(0)
  for (const item of series) {
    for (let index = 0; index < item.values.length; index++) groupBuckets[index] += item.values[index] ?? 0
  }
  const allSeries = [...series, { name: GROUP_NAME, color: GROUP_COLOR, values: groupBuckets, isGroup: true, isFocused: false }]
  const maxDps = Math.max(...allSeries.filter(item => !options.hiddenSeries.has(item.name)).flatMap(item => item.values), 1)
  const { pl, pt, cw, ch } = options.geometry

  function points(values: number[]): string {
    return values.map((value, index) => {
      const x = pl + (index / (maxBuckets - 1)) * cw
      const y = pt + ch - Math.min(value / maxDps, 1) * ch
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  const yTicks = Array.from({ length: 5 }, (_, index) => ({
    y: pt + ch - (index / 4) * ch,
    label: options.formatValue(maxDps * (index / 4), 'abbreviated'),
  }))
  const xTicks: Array<{ x: number; label: string }> = []
  for (let bucket = 0; bucket < maxBuckets; bucket += Math.ceil(60 / TIMELINE_BUCKET_SEC)) {
    const secs = bucket * TIMELINE_BUCKET_SEC
    xTicks.push({ x: pl + (bucket / (maxBuckets - 1)) * cw, label: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` })
  }
  return { series: allSeries, maxBuckets, maxDps, points, yTicks, xTicks }
}

export function buildOverviewTimelineBars(values: number[], formatTime: (ms: number) => string, formatValue: (value: number) => string): OverviewTimelineBar[] {
  const rates = values.map(value => value / TIMELINE_BUCKET_SEC)
  if (rates.length === 0) return []
  const groupSize = Math.ceil(rates.length / Math.min(28, rates.length))
  const grouped = Array.from({ length: Math.ceil(rates.length / groupSize) }, (_, index) => {
    const bucket = index * groupSize
    const value = avg(rates.slice(bucket, bucket + groupSize))
    return { key: `overview-timeline-${bucket}`, height: '0%', label: formatTime(bucket * TIMELINE_BUCKET_SEC * 1000), value: formatValue(value), bucket }
  })
  const max = Math.max(1, ...grouped.map(item => Number(item.value.replace(/[^0-9.]/g, '')) || 0), ...rates)
  return grouped.map(item => {
    const value = avg(rates.slice(item.bucket, item.bucket + groupSize))
    return { ...item, height: pctHeight(value, max, 8), value: formatValue(value) }
  })
}

export function buildPullGroupDpsBars(timeline: DpsTimeline, names: string[], deaths: DeathRecord[], formatTime: (ms: number) => string): PullGroupDpsBar[] {
  const maxBuckets = Math.max(...names.map(name => timeline[name]?.length ?? 0), 0)
  if (names.length === 0 || maxBuckets === 0) return []
  const groupSize = Math.ceil(maxBuckets / Math.min(48, maxBuckets))
  const values = Array.from({ length: Math.ceil(maxBuckets / groupSize) }, (_, index) => {
    let total = 0
    for (let bucket = index * groupSize; bucket < Math.min((index + 1) * groupSize, maxBuckets); bucket++) {
      total += names.reduce((sum, name) => sum + ((timeline[name]?.[bucket] ?? 0) / TIMELINE_BUCKET_SEC), 0)
    }
    return total / groupSize
  })
  const max = Math.max(1, ...values)
  return values.map((value, index) => {
    const bucket = index * groupSize
    const startMs = bucket * TIMELINE_BUCKET_SEC * 1000
    const endMs = startMs + groupSize * TIMELINE_BUCKET_SEC * 1000
    return {
      key: `pull-group-dps-${index}`,
      bucket,
      height: pctHeight(value, max, 6),
      value,
      label: formatTime(startMs),
      deathCount: deaths.filter(death => death.timestamp >= startMs && death.timestamp < endMs).length,
      raiseCount: deaths.filter(death => death.resurrectTime && death.resurrectTime >= startMs && death.resurrectTime < endMs).length,
    }
  })
}

export function deathClusters(deaths: DeathRecord[]) {
  const clusters: Array<{ start: number; end: number; count: number }> = []
  for (const death of deaths.slice().sort((a, b) => a.timestamp - b.timestamp)) {
    const last = clusters[clusters.length - 1]
    if (last && death.timestamp - last.end <= 15000) {
      last.end = death.timestamp
      last.count++
    } else {
      clusters.push({ start: death.timestamp, end: death.timestamp, count: 1 })
    }
  }
  return clusters.filter(cluster => cluster.count >= 2)
}
