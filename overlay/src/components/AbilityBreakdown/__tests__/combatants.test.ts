import { expect, it } from 'vitest'
import { groupCombatants, isEnemyId, isNpcId } from '../combatants'
import type { PartyMemberData } from '../types'

const partyMember = (name: string, partyType: string | undefined, job = 'WAR'): PartyMemberData => ({ id: 1, name, inParty: true, partyType, job })

it('classifies enemy and npc ids like the popout filters expect', () => {
  expect([isEnemyId('40000001'), isEnemyId('10000001')]).toEqual([true, false])
  expect([isNpcId('E0000001'), isNpcId('10000001'), isNpcId('40000001'), isNpcId('00000001')]).toEqual([true, false, false, false])
})

it('keeps the self alliance first and collapses other alliance groups', () => {
  const party: PartyMemberData[] = ['A', 'B'].flatMap(label => Array.from({ length: 8 }, (_, idx) => partyMember(`${label}${idx + 1}`, `Alliance ${label}`)))
  const groups = groupCombatants(['A1', 'B1', 'B2', 'A2'], party, 'B1')
  expect(groups.map(group => group.label)).toEqual(['Alliance  B', 'Alliance  A'])
  expect(groups[0]).toMatchObject({ names: ['B1', 'B2'], collapsed: false })
  expect(groups[1]).toMatchObject({ names: ['A1', 'A2'], collapsed: true })
})

it('uses the party group when names have no party labels', () => {
  expect(groupCombatants(['Solo'], [], '')).toEqual([{ label: 'Party', names: ['Solo'], collapsed: false }])
})
