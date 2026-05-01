import type { CombatantGroup, PartyMemberData } from './types'
import { formatPartyLabel } from './formatters'

export const blurTextStyle = {
  fontFamily: "'redacted-script-bold', monospace",
  filter: 'blur(1px)',
  userSelect: 'none' as const,
  letterSpacing: '-0.04em',
}

export function isEnemyId(id: string | undefined): boolean {
  return !!id && id.startsWith('40')
}

export function isNpcId(id: string | undefined): boolean {
  if (!id) return false
  // NPC IDs typically start with 00 or E. Player IDs start with 10, enemies with 40.
  return !id.startsWith('10') && !id.startsWith('40') && !id.startsWith('00')
}

export function visibleCombatantNames(
  names: string[],
  showEnemies: boolean,
  showFriendlyNPCs: boolean,
  isEnemy: (name: string) => boolean,
  isNPC: (name: string) => boolean,
): string[] {
  return names.filter(name => (showEnemies || !isEnemy(name)) && (showFriendlyNPCs || !isNPC(name)))
}

export function resolveSelectedCombatant(options: {
  selected: string
  initName: string
  selfName: string
  allData: Record<string, unknown>
  visibleCombatants: string[]
}): string {
  const { selected, initName, selfName, allData, visibleCombatants } = options
  if (selected && allData[selected] && visibleCombatants.includes(selected)) return selected
  if (initName && allData[initName] && visibleCombatants.includes(initName)) return initName
  if (selfName && allData[selfName]) return selfName
  return visibleCombatants[0] ?? ''
}

export function actorJobFor(name: string, combatantJobs: Record<string, string>, partyData: PartyMemberData[], normalizeJob: (job: string) => string): string {
  const direct = combatantJobs[name]
  if (direct) return normalizeJob(direct)
  const partyJob = partyData.find(member => member.name === name)?.job
  return partyJob ? normalizeJob(partyJob) : ''
}

export function nameStyleFor(name: string, blurNames: boolean, selfName: string) {
  return blurNames && name !== selfName && name !== 'YOU'
    ? blurTextStyle
    : undefined
}

export function groupCombatants(names: string[], partyData: PartyMemberData[], selfName: string): CombatantGroup[] {
  if (names.length === 0) return []

  const nameToPartyType = new Map<string, { pt: string | undefined; idx: number }>()
  for (let i = 0; i < partyData.length; i++) {
    const partyMember = partyData[i]
    nameToPartyType.set(partyMember.name, { pt: partyMember.partyType, idx: i })
  }

  const selfPartyInfo = nameToPartyType.get(selfName)
  const selfPartyType = selfPartyInfo?.pt
  const selfIdx = selfPartyInfo?.idx ?? 0
  const isAlliance = partyData.length > 8
  const partyMap = new Map<string, string[]>()

  for (const name of names) {
    const info = nameToPartyType.get(name)
    const isSelf = name === selfName || name === 'YOU'
    const label = formatPartyLabel(info?.pt, isSelf, info?.idx, partyData.length)

    if (!partyMap.has(label)) partyMap.set(label, [])
    partyMap.get(label)!.push(name)
  }

  const groups: CombatantGroup[] = []
  const selfLabel = formatPartyLabel(selfPartyType, true, selfIdx, partyData.length)

  if (isAlliance && (selfPartyType || selfIdx >= 8)) {
    const selfParty = partyMap.get(selfLabel)
    if (selfParty) {
      groups.push({ label: selfLabel, names: selfParty, collapsed: false })
    }

    for (const [label, groupNames] of partyMap) {
      if (label !== selfLabel) {
        groups.push({ label, names: groupNames, collapsed: true })
      }
    }
  } else {
    for (const [label, groupNames] of partyMap) {
      groups.push({ label, names: groupNames, collapsed: label !== selfLabel })
    }
  }

  if (groups.length === 0) groups.push({ label: 'All', names, collapsed: false })

  return groups
}
