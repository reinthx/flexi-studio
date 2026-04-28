import type { PullEntry } from './types'
import { formatEntryDelta, parseEntryDuration } from './formatters'

type DeathCluster = { start: number; end: number; count: number }
type PullDamageMetricFns = {
  attributionDamageFor: (name: string) => number
  dpsFor: (name: string) => number
  rdpsFor: (name: string) => number
  rdpsGivenFor: (name: string) => number
  rdpsTakenFor: (name: string) => number
  deathCountFor: (name: string) => number
}

export function pullEnemyHpDetail(entry: PullEntry | null | undefined, format: (value: number) => string): string {
  if (!entry) return 'needs enemy HP samples'
  if (entry.pullOutcome === 'clear') return entry.primaryEnemyMaxHp ? `Max HP ${format(entry.primaryEnemyMaxHp)}` : 'enemy defeated'
  if (entry.pullOutcome === 'wipe') return entry.primaryEnemyCurrentHp !== undefined ? `HP Remaining ${format(entry.primaryEnemyCurrentHp)}` : 'needs enemy HP samples'
  if (entry.pullOutcome === 'live') return entry.primaryEnemyCurrentHp !== undefined ? `Current HP ${format(entry.primaryEnemyCurrentHp)}` : 'needs enemy HP samples'
  return 'needs enemy HP samples'
}

export function enemyProgressHeadline(entry: PullEntry | null): string {
  if (!entry) return '—'
  if (entry.pullOutcome === 'clear') return entry.primaryEnemyName ? `Cleared ${entry.primaryEnemyName}` : 'Cleared'
  if (entry.bossPercent !== undefined && entry.primaryEnemyName) return `${entry.bossPercent.toFixed(1)}% ${entry.primaryEnemyName}`
  return entry.bossPercentLabel ?? '—'
}

export function enemyProgressMeta(entry: PullEntry | null): string {
  if (!entry) return 'No enemy progress captured'
  if ((entry.enemyCount ?? 0) > 1 && entry.defeatedEnemyCount !== undefined) return `${entry.defeatedEnemyCount}/${entry.enemyCount} defeated`
  return entry.pullOutcomeLabel ?? entry.bossPercentLabel ?? 'No enemy progress captured'
}

export function enemyProgressDetail(entry: PullEntry | null, bestProgress: PullEntry | null, format: (value: number) => string): string {
  if (!entry) return 'needs enemy HP samples'
  if (entry.pullOutcomeLabel) return `${entry.pullOutcomeLabel} · ${pullEnemyHpDetail(entry, format)}`
  if (bestProgress && entry.bossPercent !== undefined) {
    const delta = (entry.bossPercent ?? 0) - (bestProgress.bossPercent ?? 0)
    return `${entry.index === bestProgress.index ? 'best progress' : `${delta.toFixed(1)} pts from best`} · ${pullEnemyHpDetail(entry, format)}`
  }
  return pullEnemyHpDetail(entry, format)
}

export const previousPullEntry = (current: PullEntry | null, entries: PullEntry[]) =>
  !current || current.index === null ? null : entries.find(entry => (entry.pullNumber ?? 0) === (current.pullNumber ?? 0) - 1) ?? null

export const bestPullEntry = (entries: PullEntry[]) =>
  entries.reduce((best, entry) => !best || parseEntryDuration(entry) > parseEntryDuration(best) ? entry : best, null as PullEntry | null)

export const bestProgressPullEntry = (entries: PullEntry[]) =>
  entries.filter(entry => entry.bossPercent !== undefined).reduce((best, entry) => !best || (entry.bossPercent ?? 100) < (best.bossPercent ?? 100) ? entry : best, null as PullEntry | null)

export function pullDashboardNotes(
  current: PullEntry | null,
  entries: PullEntry[],
  previous: PullEntry | null,
  best: PullEntry | null,
  bestProgress: PullEntry | null,
  clusters: DeathCluster[],
  formatNumber: (value: number) => string,
  formatSeconds: (value: number) => string,
  formatTime: (ms: number) => string,
): string[] {
  if (!current) return ['No pull selected yet.']
  const notes: string[] = []
  if (best && current.index === best.index && entries.length > 1) notes.push('Longest pull for this encounter.')
  else if (best && current.index !== null) notes.push(`${formatEntryDelta(parseEntryDuration(current) - parseEntryDuration(best), seconds => formatSeconds(Math.abs(seconds)))} from best pull duration.`)
  if (current.pullOutcome !== 'clear' && bestProgress && current.index === bestProgress.index && entries.length > 1) notes.push('Best enemy progress for this encounter.')
  else if (current.pullOutcome !== 'clear' && bestProgress && current.bossPercent !== undefined) {
    const delta = current.bossPercent - (bestProgress.bossPercent ?? current.bossPercent)
    notes.push(`${delta > 0 ? '+' : ''}${delta.toFixed(1)} enemy HP points from best progress.`)
  }
  if (current.pullOutcome === 'wipe') notes.push(`Likely wipe: pull ended with enemies remaining${current.bossPercentLabel ? ` (${current.bossPercentLabel})` : ''}.`)
  else if (current.pullOutcome === 'unknown' && current.index !== null) notes.push('Outcome unknown because no enemy HP samples were captured.')
  if (previous) {
    const deathDelta = (current.deaths ?? 0) - (previous.deaths ?? 0)
    if (deathDelta < 0) notes.push(`${Math.abs(deathDelta)} fewer deaths than previous pull.`)
    if (deathDelta > 0) notes.push(`${deathDelta} more deaths than previous pull.`)
    const dpsDelta = (current.dps ?? 0) - (previous.dps ?? 0)
    if (Math.abs(dpsDelta) >= Math.max(1500, (previous.dps ?? 0) * 0.03)) notes.push(`${dpsDelta > 0 ? '+' : ''}${formatNumber(dpsDelta)} party DPS vs previous.`)
  }
  if (clusters[0]) notes.push(`${clusters[0].count} deaths clustered around ${formatTime(clusters[0].start)}-${formatTime(clusters[0].end)}.`)
  if (notes.length === 0) notes.push('No obvious swing yet; use the drilldown tabs for details.')
  return notes.slice(0, 5)
}

export function buildPullDamageRows(actorNames: string[], metrics: PullDamageMetricFns) {
  const totalDamage = actorNames.reduce((sum, name) => sum + metrics.attributionDamageFor(name), 0)
  return actorNames
    .map(name => {
      const total = metrics.attributionDamageFor(name)
      const pct = totalDamage > 0 ? (total / totalDamage) * 100 : 0
      return {
        name,
        total,
        pct: pct.toFixed(1),
        width: totalDamage > 0 ? `${Math.max(2, Math.min(100, pct)).toFixed(1)}%` : '2%',
        dps: metrics.dpsFor(name),
        rdps: metrics.rdpsFor(name),
        given: metrics.rdpsGivenFor(name),
        taken: metrics.rdpsTakenFor(name),
        deaths: metrics.deathCountFor(name),
      }
    })
    .filter(row => row.total > 0 || row.deaths > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}
