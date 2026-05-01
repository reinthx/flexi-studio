#!/usr/bin/env node
/**
 * update-assets.js
 *
 * 1. Fetches all FFXIV jobs from xivapi and saves icons to shared/assets/jobs/
 * 2. Writes shared/assets/jobs/manifest.json
 * 3. Downloads the latest common.min.js from OverlayPlugin CDN and writes
 *    it to overlay/src/vendor/common.min.js and editor/src/vendor/common.min.js
 *
 * Run: node scripts/update-assets.js
 * Requires internet. Run ~once per FFXIV major patch.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const XIVAPI       = 'https://xivapi.com'
const CLASSJOB_ICONS = 'https://raw.githubusercontent.com/xivapi/classjob-icons/master/icons/'
const COMMON_JS    = 'https://overlayplugin.github.io/OverlayPlugin/assets/shared/common.min.js'
const ICONS_OUT    = join(ROOT, 'shared/assets/jobs')
const MANIFEST_OUT = join(ROOT, 'shared/assets/jobs/manifest.json')
const VENDOR_PATHS = [
  join(ROOT, 'overlay/src/vendor/common.min.js'),
  join(ROOT, 'editor/src/vendor/common.min.js'),
]

// Map abbreviations to classjob-icons repo filenames
const CLASSJOB_ICON_MAP = {
  VPR: 'viper.png',
  PCT: 'pictomancer.png',
  RPR: 'reaper.png',
  SGE: 'sage.png',
}

// Only combat jobs get role colours — base classes and DoH/DoL are 'unknown'
const ROLE_MAP = {
  tank:    ['PLD', 'WAR', 'DRK', 'GNB'],
  healer:  ['WHM', 'SCH', 'AST', 'SGE'],
  melee:   ['MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR'],
  ranged:  ['BRD', 'MCH', 'DNC'],
  caster:  ['BLM', 'SMN', 'RDM', 'PCT', 'BLU'],
}
const JOB_ROLES = Object.fromEntries(
  Object.entries(ROLE_MAP).flatMap(([role, jobs]) => jobs.map(j => [j, role]))
)

async function main() {
  mkdirSync(ICONS_OUT, { recursive: true })

  // ── 1. Fetch full job list in one request via columns filter ──────────────
  console.log('Fetching job list from xivapi...')
  const res = await fetch(`${XIVAPI}/ClassJob?limit=100&columns=ID,Name,Abbreviation,Icon`)
  if (!res.ok) throw new Error(`xivapi returned HTTP ${res.status}`)
  const json = await res.json()
  const jobs = json.Results ?? []
  console.log(`  Found ${jobs.length} entries`)

  const manifest = {}

  // ── 2. Download icons ─────────────────────────────────────────────────────
  for (const job of jobs) {
    const abbrev = job.Abbreviation?.toUpperCase()
    if (!abbrev || !job.Icon) {
      console.warn(`  ✗ Skipped entry (no abbrev or icon):`, job)
      continue
    }

    // Icon path is relative, e.g. "/cj/1/gladiator.png"
    const iconUrl = `${XIVAPI}${job.Icon}`
    try {
      const iconRes = await fetch(iconUrl)
      if (!iconRes.ok) {
        // Try classjob-icons repo fallback for newer jobs
        const fallbackName = CLASSJOB_ICON_MAP[abbrev]
        if (fallbackName) {
          const fallbackUrl = `${CLASSJOB_ICONS}${fallbackName}`
          const fbRes = await fetch(fallbackUrl)
          if (!fbRes.ok) { console.warn(`  ✗ ${abbrev}: HTTP ${iconRes.status} (xivapi), HTTP ${fbRes.status} (fallback)`); continue }
          const buf = await fbRes.arrayBuffer()
          const outPath = join(ICONS_OUT, `${abbrev}.png`)
          writeFileSync(outPath, Buffer.from(buf))
          manifest[abbrev] = { name: job.Name, role: JOB_ROLES[abbrev] ?? 'unknown', icon: `${abbrev}.png` }
          console.log(`  ✓ ${abbrev}  (${job.Name}) [fallback]`)
          continue
        }
        console.warn(`  ✗ ${abbrev}: HTTP ${iconRes.status}`); continue
      }
      const buf = await iconRes.arrayBuffer()
      const outPath = join(ICONS_OUT, `${abbrev}.png`)
      writeFileSync(outPath, Buffer.from(buf))

      manifest[abbrev] = {
        name: job.Name,
        role: JOB_ROLES[abbrev] ?? 'unknown',
        icon: `${abbrev}.png`,
      }
      console.log(`  ✓ ${abbrev}  (${job.Name})`)
    } catch (e) {
      console.warn(`  ✗ ${abbrev}:`, e.message)
    }
  }

  writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2))
  console.log(`\nManifest written → ${MANIFEST_OUT}  (${Object.keys(manifest).length} jobs)`)

  // ── 3. Update common.min.js vendor copies ────────────────────────────────
  console.log('\nFetching common.min.js from OverlayPlugin CDN...')
  const commonRes = await fetch(COMMON_JS)
  if (!commonRes.ok) throw new Error(`CDN returned HTTP ${commonRes.status}`)
  const commonJs = await commonRes.text()

  for (const p of VENDOR_PATHS) {
    writeFileSync(p, commonJs)
    console.log(`  ✓ ${p}`)
  }

  console.log('\n✓ Assets updated.')
}

main().catch(e => { console.error(e); process.exit(1) })
