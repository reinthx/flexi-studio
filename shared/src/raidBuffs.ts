export interface RaidBuff {
  multiplier: number  // e.g. 1.05 = +5% damage equivalent
  note?: string
}

// Keyed by effectName.trim().toLowerCase() from ACT LogLine type 26/30.
// Source: consolegameswiki.com/wiki/Category:Raid_buff_actions (Dawntrail)
// Verify and update on each major patch.
export const RAID_BUFFS: Record<string, RaidBuff> = {
  // Direct damage% buffs
  'technical finish': { multiplier: 1.05, note: 'max (4 steps); less in light parties' },
  'brotherhood':      { multiplier: 1.05 },
  'divination':       { multiplier: 1.06 },
  'embolden':         { multiplier: 1.05 },
  'searing light':    { multiplier: 1.05 },
  'starry muse':      { multiplier: 1.05 },
  'arcane circle':    { multiplier: 1.03 },
  'mug':              { multiplier: 1.05 },
  'dokumori':         { multiplier: 1.05 },

  // Variable — defaults to max value
  'radiant finale':   { multiplier: 1.06, note: 'max (3 coda); less early in pull' },
  'standard finish':  { multiplier: 1.05, note: 'max (2 steps); tracks DNC partner buff' },

  // Crit rate buffs — approximated as damage equivalent
  // 10% crit rate × ~0.5 crit multiplier advantage ≈ 5% damage
  'battle litany':    { multiplier: 1.05, note: '10% crit rate → ~5% dmg approx' },
  'chain stratagem':  { multiplier: 1.05, note: '10% crit rate on target → ~5% dmg approx' },

  // DHit rate buffs — approximated
  // 20% dhit × ~25% dhit damage advantage ≈ 5% damage
  'battle voice':     { multiplier: 1.05, note: '20% dhit rate → ~5% dmg approx' },
}
