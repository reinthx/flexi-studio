import { expect, it } from 'vitest'
import { actorJobFor, blurTextStyle, groupCombatants, isEnemyId, isNpcId, nameStyleFor, resolveSelectedCombatant, visibleCombatantNames } from '../combatants'
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

it('filters visible combatants and resolves the selected actor', () => {
  const visible = visibleCombatantNames(['Player', 'Enemy', 'NPC'], false, false, name => name === 'Enemy', name => name === 'NPC')
  expect(visible).toEqual(['Player'])
  expect(resolveSelectedCombatant({
    selected: 'Enemy',
    initName: 'Player',
    selfName: 'Self',
    allData: { Player: {}, Self: {}, Enemy: {} },
    visibleCombatants: visible,
  })).toBe('Player')
  expect(resolveSelectedCombatant({
    selected: '',
    initName: '',
    selfName: 'Self',
    allData: { Self: {} },
    visibleCombatants: ['Player'],
  })).toBe('Self')
})

it('resolves actor jobs and blur name styles', () => {
  expect(actorJobFor('Alice', { Alice: 'paladin' }, [], job => job.toUpperCase())).toBe('PALADIN')
  expect(actorJobFor('Bob', {}, [partyMember('Bob', 'Party', 'whm')], job => job.toUpperCase())).toBe('WHM')
  expect(nameStyleFor('Other', true, 'Self')).toBe(blurTextStyle)
  expect(nameStyleFor('Self', true, 'Self')).toBeUndefined()
  expect(nameStyleFor('Other', false, 'Self')).toBeUndefined()
})
