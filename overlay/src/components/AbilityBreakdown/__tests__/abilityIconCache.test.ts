import { expect, it } from 'vitest'
import { abilityIconKey, abilityIdForName, safeAbilityIconSrc, useAbilityIconCache } from '../abilityIconCache'

it('builds stable icon keys and resolves ability ids from data sources and casts', () => {
  expect(abilityIconKey('', 'Fire')).toBe('unknown:Fire')
  expect(abilityIdForName('Fire', [{
    Alice: {
      fire: { abilityId: '1', abilityName: 'Fire', totalDamage: 100, hits: 1, maxHit: 100, minHit: 100 },
    },
  }], {})).toBe('1')
  expect(abilityIdForName('Raise', [], {
    Alice: [{ t: 1000, abilityId: '2', abilityName: 'Raise', source: 'Alice', target: 'Bob', type: 'instant' }],
  })).toBe('2')
  expect(abilityIdForName('Missing', [], {})).toBe('')
})

it('queues icons once, stores resolved metadata, and clears failed icons', async () => {
  let calls = 0
  const cache = useAbilityIconCache(async () => {
    calls++
    return { iconSrc: '/icon.png', recastMs: 2500 }
  })

  cache.queueAbilityIcon('1', 'Fire')
  cache.queueAbilityIcon('1', 'Fire')
  await Promise.resolve()

  expect(calls).toBe(1)
  expect(cache.abilityIconSrc('1', 'Fire')).toBe('/icon.png')
  expect(cache.abilityRecastMs('1', 'Fire')).toBe(2500)
  cache.clearAbilityIcon('1', 'Fire')
  expect(cache.abilityIconSrc('1', 'Fire')).toBe('')
})

it('allows only trusted ability icon URL shapes', () => {
  expect(safeAbilityIconSrc('/icon.png')).toBe('/icon.png')
  expect(safeAbilityIconSrc('https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F025000%2F025869_hr1.tex&format=png')).toContain('v2.xivapi.com')
  expect(safeAbilityIconSrc('//evil.test/icon.png')).toBe('')
  expect(safeAbilityIconSrc('javascript:alert(1)')).toBe('')
  expect(safeAbilityIconSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBe('')
  expect(safeAbilityIconSrc('https://example.com/icon.png')).toBe('')
  expect(safeAbilityIconSrc('https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F025000%2F025869_hr1.tex&format=svg')).toBe('')
})

it('drops unsafe resolved icon URLs while keeping safe metadata', async () => {
  const cache = useAbilityIconCache(async () => ({
    iconSrc: 'javascript:alert(1)',
    recastMs: 2500,
  }))

  cache.queueAbilityIcon('1', 'Fire')
  await Promise.resolve()

  expect(cache.abilityIconSrc('1', 'Fire')).toBe('')
  expect(cache.abilityRecastMs('1', 'Fire')).toBe(2500)
})

it('queues timeline, visible row, event, and death recap icons', async () => {
  const requested: string[] = []
  const cache = useAbilityIconCache(async abilityId => {
    requested.push(abilityId)
    return { iconSrc: `/${abilityId}.png` }
  })

  cache.queueCastTimelineRowIcons([
    { name: 'Rampart', casts: 1, avgInterval: '0.0', topTargets: [], targets: [], category: 'mitigations', events: [{ t: 1000, abilityId: 'rampart', abilityName: 'Rampart', source: 'Alice', target: 'Alice', type: 'instant' }] },
  ])
  cache.queueVisibleAbilityIcons({
    abilities: [{ abilityId: 'fire', abilityName: 'Fire', totalDamage: 100, hits: 1, maxHit: 100, minHit: 100, pct: '100.0', avg: 100, dps: 10, critPct: '-' }],
    takenAbilities: [],
    healingAbilities: [],
    eventRows: [{ key: 'event', t: 1000, actor: 'Alice', eventType: 'casts', ability: 'Raise', source: 'Alice', target: 'Bob', amount: null, hpBefore: '—', hpAfter: '—', note: '' }],
    deathHitLog: [{ t: 2000, abilityName: 'Tankbuster', sourceName: 'Boss', amount: 5000, type: 'dmg', hpBefore: 1, hpAfter: 0.1, hpBeforeRaw: 10000, hpAfterRaw: 1000, maxHp: 10000, isDeathBlow: false }],
    allData: { Alice: { fire: { abilityId: 'fire', abilityName: 'Fire', totalDamage: 100, hits: 1, maxHit: 100, minHit: 100 } } },
    damageTakenData: { Alice: { tankbuster: { abilityId: 'tankbuster', abilityName: 'Tankbuster', totalDamage: 5000, hits: 1, maxHit: 5000, minHit: 5000 } } },
    healingReceivedData: {},
    castData: { Alice: [{ t: 1000, abilityId: 'raise', abilityName: 'Raise', source: 'Alice', target: 'Bob', type: 'instant' }] },
  })
  await Promise.resolve()

  expect(requested).toEqual(['rampart', 'fire', 'raise', 'tankbuster'])
})
