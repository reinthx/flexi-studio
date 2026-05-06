import type { CastEvent } from '@shared/configSchema'
import { RAID_BUFFS } from '@shared/raidBuffs'
import type { PullEntry } from './types'
import { formatEntryDelta, parseEntryDuration } from './formatters'

type DeathCluster = { start: number; end: number; count: number }
type PullPartyMember = { name?: string }
type PullDamageMetricFns = {
  attributionDamageFor: (name: string) => number
  dpsFor: (name: string) => number
  rdpsFor: (name: string) => number
  rdpsGivenFor: (name: string) => number
  rdpsTakenFor: (name: string) => number
  deathCountFor: (name: string) => number
}

export type PullDamageRow = {
  name: string
  total: number
  pct: string
  width: string
  dps: number
  rdps: number
  given: number
  taken: number
  deaths: number
}

export type PullDashboardContext = {
  historicalPullEntries: PullEntry[]
  selectedPullEntry: PullEntry | null
  selectedEncounterPullEntries: PullEntry[]
  previousPullEntry: PullEntry | null
  bestPullEntry: PullEntry | null
  bestProgressPullEntry: PullEntry | null
  enemyProgressHeadline: string
  enemyProgressMeta: string
  enemyProgressDetail: string
  pullDashboardNotes: string[]
}

const RAID_BUFF_JOBS = new Set([
  'AST', 'BRD', 'DNC', 'DRG', 'MNK', 'NIN', 'PCT', 'RDM', 'RPR', 'SCH', 'SMN',
])
const HEALER_JOBS = new Set(['WHM', 'SCH', 'AST', 'SGE'])
const DIRECT_HEAL_ABILITIES = new Set(['cure', 'cure ii', 'medica', 'benefic', 'diagnosis', 'heal', 'heal ii'])

export function pullHasRaidBuffCredit(rdpsGiven: Record<string, number>): boolean {
  return Object.values(rdpsGiven).some(value => value > 0)
}

export function pullHasRaidBuffCast(castData: Record<string, CastEvent[]>): boolean {
  return Object.values(castData).some(casts =>
    casts.some(cast => {
      const abilityKey = cast.abilityName.trim().toLowerCase()
      const effectKey = cast.effectName?.trim().toLowerCase() ?? ''
      return !!RAID_BUFFS[abilityKey] || !!RAID_BUFFS[effectKey]
    }),
  )
}

export function partyHasRaidBuffJobs(partyData: PullPartyMember[], visibleCombatants: string[], jobFor: (name: string) => string): boolean {
  const jobs = new Set<string>()
  for (const member of partyData) {
    if (member.name) jobs.add(jobFor(member.name))
  }
  for (const name of visibleCombatants) {
    const job = jobFor(name)
    if (job) jobs.add(job)
  }
  return Array.from(jobs).some(job => RAID_BUFF_JOBS.has(job))
}

export function pullBuffWarnings(options: {
  activeView: string
  selectedName: string
  castData: Record<string, CastEvent[]>
  jobFor: (name: string) => string
  hasRaidBuffJobs: boolean
  hasRaidBuffCast: boolean
  hasRaidBuffCredit: boolean
}): string[] {
  if (options.activeView !== 'pulls') return []
  const warnings: string[] = []
  const job = options.jobFor(options.selectedName)
  if (HEALER_JOBS.has(job)) {
    const casts = options.castData[options.selectedName] ?? []
    const abilityNamesLower = new Set(casts.map(c => c.abilityName.toLowerCase()))
    if (!Array.from(DIRECT_HEAL_ABILITIES).some(name => abilityNamesLower.has(name))) warnings.push('No direct heals cast')
  }
  if (options.hasRaidBuffJobs && !options.hasRaidBuffCast && !options.hasRaidBuffCredit) {
    warnings.push('No raid buffs detected')
  }
  return warnings
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

export function buildPullDashboardContext(
  pullList: PullEntry[],
  activePullIndex: number | null,
  clusters: DeathCluster[],
  formatNumber: (value: number) => string,
  formatSeconds: (value: number) => string,
  formatTime: (ms: number) => string,
): PullDashboardContext {
  const historicalPullEntries = pullList.filter(entry => entry.index !== null)
  const selectedPullEntry = pullList.find(entry => entry.index === activePullIndex) ?? pullList[0] ?? null
  const selectedEncounter = selectedPullEntry?.encounterId
  const selectedEncounterPullEntries = selectedEncounter
    ? historicalPullEntries.filter(entry => entry.encounterId === selectedEncounter)
    : historicalPullEntries
  const previous = previousPullEntry(selectedPullEntry, selectedEncounterPullEntries)
  const best = bestPullEntry(selectedEncounterPullEntries)
  const bestProgress = bestProgressPullEntry(selectedEncounterPullEntries)
  return {
    historicalPullEntries,
    selectedPullEntry,
    selectedEncounterPullEntries,
    previousPullEntry: previous,
    bestPullEntry: best,
    bestProgressPullEntry: bestProgress,
    enemyProgressHeadline: enemyProgressHeadline(selectedPullEntry),
    enemyProgressMeta: enemyProgressMeta(selectedPullEntry),
    enemyProgressDetail: enemyProgressDetail(selectedPullEntry, bestProgress, formatNumber),
    pullDashboardNotes: pullDashboardNotes(selectedPullEntry, selectedEncounterPullEntries, previous, best, bestProgress, clusters, formatNumber, formatSeconds, formatTime),
  }
}

export function buildPullDamageRows(actorNames: string[], metrics: PullDamageMetricFns): PullDamageRow[] {
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
