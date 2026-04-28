import type { DeathRecord, DpsTimeline } from '@shared/configSchema'
import { TIMELINE_BUCKET_SEC } from '@shared/configSchema'

export type OverviewTimelineBar = { key: string; height: string; label: string; value: string; bucket: number }
export type PullGroupDpsBar = { key: string; bucket: number; height: string; value: number; label: string; deathCount: number; raiseCount: number }

const avg = (values: number[]) => values.reduce((sum, item) => sum + item, 0) / Math.max(values.length, 1)
const pctHeight = (value: number, max: number, min: number) => `${Math.max(min, Math.min(100, (value / max) * 100)).toFixed(1)}%`

export function topTimelineSpikes(values: number[]) {
  return values.map(value => value / TIMELINE_BUCKET_SEC).map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value).slice(0, 3)
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
