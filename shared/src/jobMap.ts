import type { Job, Role } from './configSchema'
import { JOB_ICONS } from './jobIcons'

export interface JobInfo {
  role: Role
  label: string       // full display name
  icon: string        // filename in assets/jobs/, e.g. 'WAR.png'
}

export const JOB_MAP: Record<Job, JobInfo> = {
  // ── Tanks ────────────────────────────────────────────────────────────────
  PLD: { role: 'tank',    label: 'Paladin',        icon: 'PLD.png' },
  WAR: { role: 'tank',    label: 'Warrior',         icon: 'WAR.png' },
  DRK: { role: 'tank',    label: 'Dark Knight',     icon: 'DRK.png' },
  GNB: { role: 'tank',    label: 'Gunbreaker',      icon: 'GNB.png' },

  // ── Healers ──────────────────────────────────────────────────────────────
  WHM: { role: 'healer',  label: 'White Mage',      icon: 'WHM.png' },
  SCH: { role: 'healer',  label: 'Scholar',          icon: 'SCH.png' },
  AST: { role: 'healer',  label: 'Astrologian',      icon: 'AST.png' },
  SGE: { role: 'healer',  label: 'Sage',             icon: 'SGE.png' },

  // ── Melee DPS ────────────────────────────────────────────────────────────
  MNK: { role: 'melee',   label: 'Monk',             icon: 'MNK.png' },
  DRG: { role: 'melee',   label: 'Dragoon',          icon: 'DRG.png' },
  NIN: { role: 'melee',   label: 'Ninja',            icon: 'NIN.png' },
  SAM: { role: 'melee',   label: 'Samurai',          icon: 'SAM.png' },
  RPR: { role: 'melee',   label: 'Reaper',           icon: 'RPR.png' },
  VPR: { role: 'melee',   label: 'Viper',            icon: 'VPR.png' },

  // ── Ranged DPS ───────────────────────────────────────────────────────────
  BRD: { role: 'ranged',  label: 'Bard',             icon: 'BRD.png' },
  MCH: { role: 'ranged',  label: 'Machinist',        icon: 'MCH.png' },
  DNC: { role: 'ranged',  label: 'Dancer',           icon: 'DNC.png' },

  // ── Caster DPS ───────────────────────────────────────────────────────────
  BLM: { role: 'caster',  label: 'Black Mage',       icon: 'BLM.png' },
  SMN: { role: 'caster',  label: 'Summoner',         icon: 'SMN.png' },
  RDM: { role: 'caster',  label: 'Red Mage',         icon: 'RDM.png' },
  PCT: { role: 'caster',  label: 'Pictomancer',      icon: 'PCT.png' },
  BLU: { role: 'caster',  label: 'Blue Mage',        icon: 'BLU.png' },

  // ── Crafters (non-combat, treated as unknown) ─────────────────────────────
  CRP: { role: 'unknown', label: 'Carpenter',        icon: 'CRP.png' },
  BSM: { role: 'unknown', label: 'Blacksmith',       icon: 'BSM.png' },
  ARM: { role: 'unknown', label: 'Armorer',          icon: 'ARM.png' },
  GSM: { role: 'unknown', label: 'Goldsmith',        icon: 'GSM.png' },
  LTW: { role: 'unknown', label: 'Leatherworker',    icon: 'LTW.png' },
  WVR: { role: 'unknown', label: 'Weaver',           icon: 'WVR.png' },
  ALC: { role: 'unknown', label: 'Alchemist',        icon: 'ALC.png' },
  CUL: { role: 'unknown', label: 'Culinarian',       icon: 'CUL.png' },

  // ── Gatherers (non-combat, treated as unknown) ────────────────────────────
  MIN: { role: 'unknown', label: 'Miner',            icon: 'MIN.png' },
  BTN: { role: 'unknown', label: 'Botanist',         icon: 'BTN.png' },
  FSH: { role: 'unknown', label: 'Fisher',           icon: 'FSH.png' },

  // ── Special ───────────────────────────────────────────────────────────────
  LB:  { role: 'unknown', label: 'Limit Break',      icon: 'LB.png' },

  // ── Fallback ──────────────────────────────────────────────────────────────
  ADV: { role: 'unknown', label: 'Adventurer',       icon: 'ADV.png' },
}

/** Normalize ACT job strings (e.g. "Limit Break") to abbreviations */
const JOB_ALIASES: Record<string, string> = {
  'LIMIT BREAK': 'LB',
}

const JOB_ID_ALIASES: Record<string, string> = {
  '1': 'GLA',
  '2': 'PGL',
  '3': 'MRD',
  '4': 'LNC',
  '5': 'ARC',
  '6': 'CNJ',
  '7': 'THM',
  '19': 'PLD',
  '20': 'MNK',
  '21': 'WAR',
  '22': 'DRG',
  '23': 'BRD',
  '24': 'WHM',
  '25': 'BLM',
  '26': 'ACN',
  '27': 'SMN',
  '28': 'SCH',
  '29': 'ROG',
  '30': 'NIN',
  '31': 'MCH',
  '32': 'DRK',
  '33': 'AST',
  '34': 'SAM',
  '35': 'RDM',
  '36': 'BLU',
  '37': 'GNB',
  '38': 'DNC',
  '39': 'RPR',
  '40': 'SGE',
  '41': 'VPR',
  '42': 'PCT',
}

/** Normalize ACT job strings or numeric ClassJob IDs to abbreviations. */
export function normalizeJob(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  const value = String(raw).trim()
  if (!value) return ''
  const upper = value.toUpperCase()
  return JOB_ALIASES[upper] ?? JOB_ID_ALIASES[upper] ?? upper
}

export function getJobInfo(abbrev: unknown): JobInfo {
  const normalized = normalizeJob(abbrev)
  const key = normalized.toUpperCase() as Job
  return JOB_MAP[key] ?? { role: 'unknown', label: normalized || 'Adventurer', icon: 'ADV.png' }
}

export function getRole(abbrev: unknown): Role {
  return getJobInfo(abbrev).role
}


export function getJobIconSrc(abbrev: unknown): string {
  const key = normalizeJob(abbrev).toUpperCase()
  return JOB_ICONS[key] ?? JOB_ICONS['ADV'] ?? ''
}
