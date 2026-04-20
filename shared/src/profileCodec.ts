/**
 * Profile share codec — compresses profile JSON into a compact, URL-safe string
 * that can be pasted into Discord chat.
 *
 * Format: "FLEXI1:" + base64url(deflate(json))
 *
 * Built-in texture/icon data URLs are replaced with short reference tokens before
 * compression, and restored on decode. Custom (user-uploaded) data URLs are
 * deduplicated into an _assets array so the same image used 3× only appears once.
 * At export time, custom images are re-encoded at lower quality/resolution to
 * minimize share string size while keeping full quality in the working profile.
 */

import { BAR_TEXTURE_PRESETS } from './texturePresets'
import { JOB_ICONS } from './jobIcons'
import { CROWN_CUTE_SRC } from './crownAssets'
import type { Profile, LabelField, BarShape, BarLabel, GlobalConfig, Job, Role } from './configSchema'

// ── JSON Key Minification ──────────────────────────────────────────────────────────

const KEY_TO_SHORT: Record<string, string> = {
  color: 'c',
  enabled: 'e',
  offsetX: 'ox',
  offsetY: 'oy',
  show: 's',
  width: 'w',
  height: 'h',
  opacity: 'o',
  radius: 'r',
  thickness: 'th',
  template: 't',
  background: 'bg',
  outline: 'ol',
  shadow: 'sh',
  padding: 'p',
  maxCombatants: 'mc',
}

const SHORT_TO_KEY: Record<string, string> = Object.entries(KEY_TO_SHORT).reduce((acc, [k, v]) => {
  acc[v] = k
  return acc
}, {} as Record<string, string>)

function expandArrays(json: string): string {
  let result = json
  // Expand offset arrays: {"os":[5,10]} → {"ox":5,"oy":10}
  result = result.replace(/"os":\[(\d+),(\d+)\]/g, '"ox":$1,"oy":$2')
  // Expand thickness arrays: {"th":[0,0,0,0]} → {"top":0,"right":0,"bottom":0,"left":0}
  result = result.replace(/"th":\[(\d+),(\d+),(\d+),(\d+)\]/g, '"top":$1,"right":$2,"bottom":$3,"left":$4')
  return result
}

function expandKeys(json: string): string {
  let result = json
  for (const [short, key] of Object.entries(SHORT_TO_KEY)) {
    result = result.replaceAll(`"${short}":`, `"${key}":`)
  }
  return result
}
const HEADER = 'FLEXI1:'
const LEGACY_HEADER = 'ACTFLEXI1:'

// ── Export-time image optimization ──
// JPEG quality (0.70 = 70%) for custom images in share strings.
// Only reduce quality, never downscale - smaller dimensions can cause
// textures to not fill bars at larger bar sizes.
const EXPORT_QUALITY = 0.70

// ── Token maps: replace large data URLs with short refs before compression ──

const textureSrcToToken = new Map<string, string>()
const tokenToTextureSrc = new Map<string, string>()
for (const p of BAR_TEXTURE_PRESETS) {
  const token = `$TEX:${p.name}`
  textureSrcToToken.set(p.src, token)
  tokenToTextureSrc.set(token, p.src)
}

const iconSrcToToken = new Map<string, string>()
const tokenToIconSrc = new Map<string, string>()
for (const [abbr, src] of Object.entries(JOB_ICONS)) {
  const token = `$ICO:${abbr}`
  iconSrcToToken.set(src, token)
  tokenToIconSrc.set(token, src)
}

// Crown built-in assets
const crownSrcToToken = new Map<string, string>([
  [CROWN_CUTE_SRC, '$CRW:cute'],
])
const tokenToCrownSrc = new Map<string, string>([
  ['$CRW:cute', CROWN_CUTE_SRC],
])

/** Replace known data URLs with short tokens in a JSON string. */
function tokenize(json: string): string {
  for (const [src, token] of textureSrcToToken) {
    json = json.replaceAll(JSON.stringify(src), JSON.stringify(token))
  }
  for (const [src, token] of iconSrcToToken) {
    json = json.replaceAll(JSON.stringify(src), JSON.stringify(token))
  }
  for (const [src, token] of crownSrcToToken) {
    json = json.replaceAll(JSON.stringify(src), JSON.stringify(token))
  }
  return json
}

/** Restore short tokens back to full data URLs. */
function detokenize(json: string): string {
  for (const [token, src] of tokenToTextureSrc) {
    json = json.replaceAll(JSON.stringify(token), JSON.stringify(src))
  }
  for (const [token, src] of tokenToIconSrc) {
    json = json.replaceAll(JSON.stringify(token), JSON.stringify(src))
  }
  for (const [token, src] of tokenToCrownSrc) {
    json = json.replaceAll(JSON.stringify(token), JSON.stringify(src))
  }
  return json
}

// ── Custom asset deduplication ──

const DATA_URL_RE = /"(data:[^"]{100,})"/g

function deduplicateAssets(json: string): string {
  const urls = new Map<string, number>()
  for (const m of json.matchAll(DATA_URL_RE)) {
    const url = m[1]
    if (!urls.has(url)) urls.set(url, urls.size)
  }
  if (urls.size === 0) return json

  for (const [url, idx] of urls) {
    json = json.replaceAll(JSON.stringify(url), JSON.stringify(`$A:${idx}`))
  }

  const parsed = JSON.parse(json)
  const assets: string[] = new Array(urls.size)
  for (const [url, idx] of urls) assets[idx] = url
  parsed.push({ _assets: assets })
  return JSON.stringify(parsed)
}

function restoreAssets(json: string): string {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) return json

  const last = parsed[parsed.length - 1]
  if (!last?._assets) return json

  const assets: string[] = last._assets
  parsed.pop()
  let restored = JSON.stringify(parsed)

  for (let i = 0; i < assets.length; i++) {
    restored = restored.replaceAll(JSON.stringify(`$A:${i}`), JSON.stringify(assets[i]))
  }
  return restored
}

// ── Export-time image re-encoding ──

/** Re-encode a data URL image at lower quality for export (preserves dimensions). */
async function optimizeDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') return dataUrl
  if (dataUrl.length < 10000) return dataUrl
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = dataUrl
  })
  const { width, height } = img
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return new Promise<string>((resolve) => {
    canvas.toBlob(
      blob => {
        if (!blob) { resolve(dataUrl); return }
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Only use the optimized version if it's actually smaller
          resolve(result.length < dataUrl.length ? result : dataUrl)
        }
        reader.onerror = () => resolve(dataUrl)
        reader.readAsDataURL(blob)
      },
      'image/webp',
      EXPORT_QUALITY,
    )
  })
}

/** Optimize all custom data URLs in a JSON string before compression. */
async function optimizeCustomAssets(json: string): Promise<string> {
  const matches = [...json.matchAll(DATA_URL_RE)]
  if (matches.length === 0) return json
  const unique = [...new Set(matches.map(m => m[1]))]
  const optimized = new Map<string, string>()
  await Promise.all(unique.map(async (url) => {
    optimized.set(url, await optimizeDataUrl(url))
  }))
  for (const [original, opt] of optimized) {
    if (opt !== original) {
      json = json.replaceAll(JSON.stringify(original), JSON.stringify(opt))
    }
  }
  return json
}

// ── Compression ──

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate')
  const w = cs.writable.getWriter()
  w.write(data as unknown as BufferSource)
  w.close()
  const chunks: Uint8Array[] = []
  for (const r = cs.readable.getReader(); ;) {
    const { done, value } = await r.read()
    if (done) break
    chunks.push(value)
  }
  return concat(chunks)
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate')
  const w = ds.writable.getWriter()
  w.write(data as unknown as BufferSource)
  w.close()
  const chunks: Uint8Array[] = []
  for (const r = ds.readable.getReader(); ;) {
    const { done, value } = await r.read()
    if (done) break
    chunks.push(value)
  }
  return concat(chunks)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

// ── Base64url (no padding, URL-safe) ──

function toBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - str.length % 4) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ── Cleanup dead fields ────────────────────────────────────────────────────

const DEAD_LABEL_FIELDS = ['leftTemplate', 'rightTemplate', 'leftOffsetX', 'leftOffsetY', 'rightOffsetX', 'rightOffsetY', 'selfColor']

const DEFAULT_JOB_ENABLED: Record<string, boolean> = {
  PLD: true, WAR: true, DRK: true, GNB: true,
  WHM: true, SCH: true, AST: true, SGE: true,
  MNK: true, DRG: true, NIN: true, SAM: true, RPR: true, VPR: true,
  BRD: true, MCH: true, DNC: true,
  BLM: true, SMN: true, RDM: true, PCT: true, BLU: true,
}

const DEFAULT_ROLE_ENABLED: Record<string, boolean> = {
  tank: true, healer: true, melee: true, ranged: true, caster: true,
}

// Default colors (inline to avoid importing from presets at runtime during delta encoding)
const DEFAULT_JOB_COLORS: Record<string, string> = {
  PLD: '#A6D100', WAR: '#D30000', DRK: '#B080D0', GNB: '#F0C040',
  WHM: '#B5D0A0', SCH: '#E080B0', AST: '#F0E080', SGE: '#80C0F0',
  MNK: '#E08040', DRG: '#5040A0', NIN: '#A04080', SAM: '#E04040', RPR: '#8040A0', VPR: '#40A040',
  BRD: '#A0C040', MCH: '#6080C0', DNC: '#E060A0',
  BLM: '#8060C0', SMN: '#40A040', RDM: '#E04040', PCT: '#F0A040', BLU: '#40A0C0',
}

const DEFAULT_ROLE_COLORS: Record<string, string> = {
  tank: '#4a90d9', healer: '#52b788', melee: '#e63946', ranged: '#f4a261', caster: '#9b5de5',
}

const DEFAULT_SHAPE: BarShape = {
  leftEdge: 'flat', rightEdge: 'flat', edgeDepth: 10, chamferMode: 'none',
  cornerCuts: { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } },
  borderRadius: { tl: 3, tr: 3, br: 3, bl: 3 },
  outline: { color: 'rgba(255,255,255,0.15)', thickness: { top: 0, right: 0, bottom: 1, left: 0 } },
  shadow: { enabled: false, color: '#000000', blur: 4, thickness: 0, offsetX: 0, offsetY: 2 },
  fillShadow: { enabled: false, color: '#000000', blur: 4, thickness: 0, offsetX: 0, offsetY: 1 },
}

const DEFAULT_LABEL: BarLabel = {
  font: 'Segoe UI', size: 12, color: '#ffffff',
  fields: [
    { id: 'f1', template: '{name}', hAnchor: 'left', vAnchor: 'middle', offsetX: 0, offsetY: 0, enabled: true },
    { id: 'f2', template: '{value} ({pct})', hAnchor: 'right', vAnchor: 'middle', offsetX: 0, offsetY: 0, enabled: true },
  ],
  shadow: { enabled: true, color: '#000000', blur: 2, offsetX: 0, offsetY: 1, thickness: 1 },
  outline: { enabled: false, color: '#000000', width: 1, gradient: null },
  iconConfig: {
    sizeOverride: 0, opacity: 1, show: true, separateRow: false, offsetX: 0, offsetY: 0,
    shadow: { enabled: false, color: '#000000', blur: 4, offsetX: 0, offsetY: 1 },
    bgShape: { enabled: false, shape: 'circle', color: '#000000', size: 24, opacity: 0.5, offsetX: 0, offsetY: 0 },
  },
  textTransform: 'none', padding: 4, gap: 4, gradient: null,
  separateRowDeaths: false, deathOffsetX: 0, deathOffsetY: 0, deathSize: 12, deathOpacity: 1,
}

const DEFAULT_GLOBAL: GlobalConfig = {
  dpsType: 'encdps', sortBy: 'encdps', maxCombatants: 72, showHeader: true,
  transitionDuration: 800, holdDuration: 12000, orientation: 'vertical', opacity: 1,
  outOfCombat: 'dim', outOfCombatOpacity: 0.4, valueFormat: 'abbreviated',
  combatantFilter: 'all', partyOnly: false, selfOnly: false, blurNames: false,
  windowOpacity: 1,
  windowBorder: { enabled: false, color: '#2a2a3e', width: 1, radius: 4 },
  windowShadow: { enabled: false, color: 'rgba(0,0,0,0.5)', blur: 8, offsetX: 0, offsetY: 2 },
  windowBg: 'transparent', windowBackground: { type: 'solid', color: 'transparent' },
  mergePets: true,
  tabsEnabled: false, tabs: [], activeTab: '', tabsPinned: false,
  header: { show: true, template: '{encounter}  {duration}', font: 'Segoe UI', size: 11, color: '#cccccc', background: { type: 'solid', color: '#0d0d1a' }, borderRadius: 4, pinned: true },
  footer: { show: false, template: 'Total: {totalDPS} DPS', font: 'Segoe UI', size: 11, color: '#cccccc', background: { type: 'solid', color: '#0d0d1a' }, borderRadius: 4, pinned: true },
  rankIndicator: { rank1Enabled: false, rank1Style: {}, showNumbers: false, rank1HeightIncrease: 0, rank1ShowCrown: false, rank1Crown: { enabled: false, icon: '👑', imageUrl: '$CRW:cute', size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' }, rank1Glow: { enabled: false, color: '#FFD700', blur: 8 },
      rank1NameStyle: { enabled: false }, },
  pets: { show: false, mergeWithOwner: true, petStyle: {} },
}

function cleanProfile(profile: Profile): Profile {
  const cleaned = JSON.parse(JSON.stringify(profile))

  // Strip dead label fields
  if (cleaned.default?.label) {
    for (const field of DEAD_LABEL_FIELDS) {
      delete cleaned.default.label[field]
    }
  }

  // Migrate label fields: colorMode 'self' → selfMode:true, strip dead selfColor
  function migrateLabelFields(fields: Partial<LabelField>[]) {
    for (const f of fields) {
      const anyF = f as Record<string, unknown>
      delete anyF.selfColor
      if ((anyF.colorMode as string) === 'self') {
        f.selfMode = true
        delete f.colorMode
      }
    }
  }
  if (Array.isArray(cleaned.default?.label?.fields)) {
    migrateLabelFields(cleaned.default.label.fields)
  }
  // Also migrate tab labelConfig fields
  if (Array.isArray(cleaned.global?.tabs)) {
    for (const tab of cleaned.global.tabs) {
      if (Array.isArray(tab.labelConfig?.fields)) migrateLabelFields(tab.labelConfig.fields)
    }
  }
  // Also migrate rank1Style label fields if present
  if (Array.isArray(cleaned.global?.rankIndicator?.rank1Style?.label?.fields)) {
    migrateLabelFields(cleaned.global.rankIndicator.rank1Style.label.fields)
  }

  // Clean gradientColor - strip if fill.type is not gradient
  if (cleaned.default?.fill?.type !== 'gradient') delete cleaned.default.gradientColor
  if (cleaned.default?.bg?.type !== 'gradient') delete cleaned.default.bg.gradientColor
  if (cleaned.global?.windowBackground?.type !== 'gradient') delete cleaned.global.windowBackground.gradientColor

  // Strip "enabled: false" blocks that match defaults
  // label.shadow
  if (cleaned.default?.label?.shadow?.enabled === false && 
      JSON.stringify(cleaned.default.label.shadow).length < 80) {
    delete cleaned.default.label.shadow
  }
  // label.outline with enabled: false
  if (cleaned.default?.label?.outline?.enabled === false) {
    delete cleaned.default.label.outline
  }
  // iconConfig.shadow enabled: false
  if (cleaned.default?.label?.iconConfig?.shadow?.enabled === false) {
    delete cleaned.default.label.iconConfig.shadow
  }
  // iconConfig.outline enabled: false
  if (cleaned.default?.label?.iconConfig?.outline?.enabled === false) {
    delete cleaned.default.label.iconConfig.outline
  }
  // iconConfig.classOutline enabled: false
  if (cleaned.default?.label?.iconConfig?.classOutline?.enabled === false) {
    delete cleaned.default.label.iconConfig.classOutline
  }
  // shape.fillShadow enabled: false
  if (cleaned.default?.shape?.fillShadow?.enabled === false && 
      JSON.stringify(cleaned.default.shape.fillShadow).length < 60) {
    delete cleaned.default.shape.fillShadow
  }

  // Strip shape fields matching defaults
  if (cleaned.default?.shape) {
    const shape = cleaned.default.shape as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(DEFAULT_SHAPE)) {
      if (JSON.stringify(shape[key]) === JSON.stringify(value)) {
        delete shape[key]
      }
    }
    if (Object.keys(cleaned.default.shape).length === 0) delete cleaned.default.shape
  }

  // Strip label fields matching defaults
  if (cleaned.default?.label) {
    const labelDefaults = ['font', 'size', 'color', 'textTransform', 'padding', 'gap', 'gradient', 'separateRowDeaths', 'deathOffsetX', 'deathOffsetY', 'deathSize', 'deathOpacity']
    for (const key of labelDefaults) {
      if (cleaned.default.label[key] === (DEFAULT_LABEL as unknown as Record<string, unknown>)[key]) delete cleaned.default.label[key]
    }
    if (cleaned.default.label.fields) {
      const defFields = DEFAULT_LABEL.fields
      const fields = cleaned.default.label.fields.filter((f: any, i: number) => {
        if (!defFields[i]) return true
        return JSON.stringify(f) !== JSON.stringify(defFields[i])
      })
      cleaned.default.label.fields = fields.length > 0 ? fields : undefined
      if (!cleaned.default.label.fields) delete cleaned.default.label.fields
    }
    if (cleaned.default.label.shadow) {
      const match = JSON.stringify(cleaned.default.label.shadow) === JSON.stringify(DEFAULT_LABEL.shadow)
      if (match) delete cleaned.default.label.shadow
    }
    if (cleaned.default.label.outline) {
      const match = JSON.stringify(cleaned.default.label.outline) === JSON.stringify(DEFAULT_LABEL.outline)
      if (match) delete cleaned.default.label.outline
    }
    if (cleaned.default.label.iconConfig) {
      const match = JSON.stringify(cleaned.default.label.iconConfig) === JSON.stringify(DEFAULT_LABEL.iconConfig)
      if (match) delete cleaned.default.label.iconConfig
    }
  }

  // Strip global fields matching defaults
  if (cleaned.global) {
    const globalScalarDefaults: Record<string, any> = {
      dpsType: 'encdps', sortBy: 'encdps', maxCombatants: 72, showHeader: true,
      transitionDuration: 800, holdDuration: 12000, orientation: 'vertical', opacity: 1,
      outOfCombat: 'dim', outOfCombatOpacity: 0.4, valueFormat: 'abbreviated',
      combatantFilter: 'all', partyOnly: false, selfOnly: false, blurNames: false,
      windowOpacity: 1, windowBg: 'transparent', mergePets: true,
      header: { show: true, background: { type: 'solid', color: '#0d0d1a' }, borderRadius: 4, pinned: true },
      footer: { show: false, background: { type: 'solid', color: '#0d0d1a' }, borderRadius: 4, pinned: true },
      rankIndicator: { rank1Enabled: false, showNumbers: false, rank1HeightIncrease: 0, rank1ShowCrown: false, rank1Crown: { enabled: false, icon: '👑', imageUrl: '$CRW:cute', size: 20, offsetX: 2, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'middle' }, rank1Glow: { enabled: false, color: '#FFD700', blur: 8 },
      rank1NameStyle: { enabled: false }, },
      pets: { show: false, mergeWithOwner: true },
    }
    for (const [key, value] of Object.entries(globalScalarDefaults)) {
      if (cleaned.global[key] === value) delete cleaned.global[key]
    }
    if (cleaned.global.windowBorder?.enabled === false) {
      delete cleaned.global.windowBorder
    }
    if (cleaned.global.windowShadow?.enabled === false) {
      delete cleaned.global.windowShadow
    }
    if (cleaned.global.windowBackground?.type === 'solid' && cleaned.global.windowBackground.color === 'transparent') {
      delete cleaned.global.windowBackground
    }
    if (cleaned.global.header?.template === '{encounter}  {duration}' && cleaned.global.header.font === 'Segoe UI' && cleaned.global.header.size === 11 && cleaned.global.header.color === '#cccccc') {
      delete cleaned.global.header
    }
    if (cleaned.global.footer?.show === false) {
      delete cleaned.global.footer
    }
    if (cleaned.global.rankIndicator) {
      const ri = cleaned.global.rankIndicator
      // Strip rank1Style if empty
      if (ri.rank1Style && Object.keys(ri.rank1Style).length === 0) delete ri.rank1Style
      // Strip rank1NameStyle.glow (removed from schema — migrate out)
      if (ri.rank1NameStyle?.glow !== undefined) delete ri.rank1NameStyle.glow
      // Strip rank1NameStyle if default { enabled: false }
      if (ri.rank1NameStyle?.enabled === false && !ri.rank1NameStyle.gradient) {
        delete ri.rank1NameStyle
      }
      // Strip rank1IconStyle if disabled (default absent)
      if (ri.rank1IconStyle?.enabled === false) delete ri.rank1IconStyle
      // Strip whole rankIndicator if only default-off fields remain
      if (ri.rank1Enabled === false && !ri.rank1Style && !ri.rank1NameStyle && !ri.rank1IconStyle &&
          ri.showNumbers === false && !ri.rank1HeightIncrease &&
          !ri.rank1ShowCrown && ri.rank1Crown?.enabled === false && ri.rank1Glow?.enabled === false) {
        delete cleaned.global.rankIndicator
      }
    }
    if (cleaned.global.pets?.show === false && cleaned.global.pets?.mergeWithOwner === true && Object.keys(cleaned.global.pets).length <= 2) {
      delete cleaned.global.pets
    }
  }
  if (cleaned.overrides?.byJobEnabled) {
    for (const [job, enabled] of Object.entries(cleaned.overrides.byJobEnabled)) {
      if (enabled === true) delete cleaned.overrides.byJobEnabled[job as Job]
    }
  }
  if (cleaned.overrides?.byRoleEnabled) {
    for (const [role, enabled] of Object.entries(cleaned.overrides.byRoleEnabled)) {
      if (enabled === true) delete cleaned.overrides.byRoleEnabled[role as Role]
    }
  }
  if (cleaned.overrides?.byJob) {
    const byJobCompact: Record<string, any> = {}
    for (const [job, config] of Object.entries(cleaned.overrides.byJob as Record<string, any>)) {
      const c = config as any
      const color = c?.fill?.color
      if (color !== DEFAULT_JOB_COLORS[job] || c?.gradientColor) {
        const entry: any = { fill: { type: c?.fill?.type, color } }
        if (c?.gradientColor) entry.gradientColor = c.gradientColor
        byJobCompact[job] = entry
      }
    }
    cleaned.overrides.byJob = Object.keys(byJobCompact).length > 0 ? byJobCompact : undefined
  }
  if (cleaned.overrides?.byRole) {
    const byRoleCompact: Record<string, any> = {}
    for (const [role, config] of Object.entries(cleaned.overrides.byRole as Record<string, any>)) {
      const c = config as any
      const color = c?.fill?.color
      if (color !== DEFAULT_ROLE_COLORS[role] || c?.gradientColor) {
        const entry: any = { fill: { type: c?.fill?.type, color } }
        if (c?.gradientColor) entry.gradientColor = c.gradientColor
        byRoleCompact[role] = entry
      }
    }
    cleaned.overrides.byRole = Object.keys(byRoleCompact).length > 0 ? byRoleCompact : undefined
  }
  // overrides.self - always preserve gradientColor
  // (no deletion — gradientColor used by label gradient mode regardless of fill type)
  return cleaned
}

function restoreDefaults(profile: Profile): Profile {
  const restored = { ...profile }
  if (restored.overrides) {
    if (!restored.overrides.byJobEnabled) {
      restored.overrides.byJobEnabled = { ...DEFAULT_JOB_ENABLED }
    } else {
      for (const [job, enabled] of Object.entries(DEFAULT_JOB_ENABLED)) {
        if (restored.overrides.byJobEnabled[job as Job] === undefined) {
          restored.overrides.byJobEnabled[job as Job] = enabled
        }
      }
    }
    if (!restored.overrides.byRoleEnabled) {
      restored.overrides.byRoleEnabled = { ...DEFAULT_ROLE_ENABLED }
    } else {
      for (const [role, enabled] of Object.entries(DEFAULT_ROLE_ENABLED)) {
        if (restored.overrides.byRoleEnabled[role as Role] === undefined) {
          restored.overrides.byRoleEnabled[role as Role] = enabled
        }
      }
    }
    const byJobFull: Record<string, any> = {}
    for (const job of Object.keys(DEFAULT_JOB_COLORS)) {
      const config = restored.overrides.byJob?.[job as Job] as any
      if (config) {
        const fillType = config.fill?.type || 'solid'
        byJobFull[job] = { fill: { type: fillType, color: config.fill?.color || config }, ...(config.gradientColor && { gradientColor: config.gradientColor }) }
      } else {
        byJobFull[job] = { fill: { type: 'solid', color: DEFAULT_JOB_COLORS[job] } }
      }
    }
    restored.overrides.byJob = byJobFull
    const byRoleFull: Record<string, any> = {}
    for (const role of Object.keys(DEFAULT_ROLE_COLORS)) {
      const config = restored.overrides.byRole?.[role as Role] as any
      if (config) {
        const fillType = config.fill?.type || 'solid'
        byRoleFull[role] = { fill: { type: fillType, color: config.fill?.color || config }, ...(config.gradientColor && { gradientColor: config.gradientColor }) }
      } else {
        byRoleFull[role] = { fill: { type: 'solid', color: DEFAULT_ROLE_COLORS[role] } }
      }
    }
    restored.overrides.byRole = byRoleFull
  }

  // Restore default shape
  if (!restored.default?.shape) {
    restored.default.shape = { ...DEFAULT_SHAPE }
  } else {
    const shape = restored.default.shape as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(DEFAULT_SHAPE)) {
      if (shape[key] === undefined) {
        shape[key] = value
      }
    }
  }

  // Restore default label
  if (!restored.default?.label) {
    restored.default.label = { ...DEFAULT_LABEL }
  } else {
    restored.default.label = { ...DEFAULT_LABEL, ...restored.default.label }
    if (!restored.default.label.fields) restored.default.label.fields = DEFAULT_LABEL.fields
    // Restore label.shadow if missing (default has enabled: true)
    if (!restored.default.label.shadow) restored.default.label.shadow = { ...DEFAULT_LABEL.shadow }
  }

  // Restore default global
  if (!restored.global) {
    restored.global = { ...DEFAULT_GLOBAL }
  } else {
    restored.global = { ...DEFAULT_GLOBAL, ...restored.global }
    if (!restored.global.windowBorder) restored.global.windowBorder = DEFAULT_GLOBAL.windowBorder
    if (!restored.global.windowShadow) restored.global.windowShadow = DEFAULT_GLOBAL.windowShadow
    if (!restored.global.windowBackground) restored.global.windowBackground = DEFAULT_GLOBAL.windowBackground
    if (!restored.global.header) restored.global.header = DEFAULT_GLOBAL.header
    if (!restored.global.footer) restored.global.footer = DEFAULT_GLOBAL.footer
    if (!restored.global.rankIndicator) {
      restored.global.rankIndicator = DEFAULT_GLOBAL.rankIndicator
    } else {
      // Restore sub-fields added after older presets were encoded
      if (!restored.global.rankIndicator.rank1NameStyle) {
        restored.global.rankIndicator.rank1NameStyle = DEFAULT_GLOBAL.rankIndicator.rank1NameStyle
      }
      if (!restored.global.rankIndicator.rank1Style) {
        restored.global.rankIndicator.rank1Style = {}
      }
      // Restore crown fields added later
      const rc = restored.global.rankIndicator.rank1Crown
      if (rc) {
        if (rc.rotation === undefined) rc.rotation = 0
        if (!rc.imageUrl) rc.imageUrl = CROWN_CUTE_SRC
      }
    }
    if (!restored.global.pets) restored.global.pets = DEFAULT_GLOBAL.pets
  }

  return restored
}

// ── Public API ──

/** Encode profile(s) to a compact share string. */
export async function encodeShareString(presets: Array<{ name: string; profile: any }>): Promise<string> {
  const cleanedPresets = presets.map(p => ({ ...p, profile: cleanProfile(p.profile) }))
  let json = tokenize(JSON.stringify(cleanedPresets))
  json = await optimizeCustomAssets(json)
  json = deduplicateAssets(json)
  const compressed = await deflate(new TextEncoder().encode(json))
  return HEADER + toBase64url(compressed)
}

/** Decode a share string back to profile(s). Returns null if invalid. */
export async function decodeShareString(shareStr: string): Promise<Array<{ name: string; profile: any }> | null> {
  const trimmed = shareStr.trim()
  let b64: string
  if (trimmed.startsWith(HEADER)) {
    b64 = trimmed.slice(HEADER.length)
  } else if (trimmed.startsWith(LEGACY_HEADER)) {
    b64 = trimmed.slice(LEGACY_HEADER.length)
  } else {
    return null
  }
  try {
    let json: string
    try {
      // First try: existing format (deflate)
      const decompressed = await inflate(fromBase64url(b64))
      json = new TextDecoder().decode(decompressed)
    } catch {
      // If deflate fails, legacy presets might have different format - try as-is
      return null
    }
    // Restore minified keys and arrays (backward compatibility)
    // Only attempt if JSON was actually minified - check for short keys/arrays pattern first
    const hasShortKeys = json.includes('"c":') || json.includes('"e":') || json.includes('"os":') || json.includes('"th":')
    if (hasShortKeys) {
      try {
        json = expandKeys(json)
        json = expandArrays(json)
      } catch {
        // expansion failed, keep original
      }
    }
    // Always try restore assets
    try {
      json = restoreAssets(json)
    } catch {
      // no assets to restore
    }
    json = detokenize(json)
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return parsed.map((p: any) => ({
      ...p,
      profile: restoreDefaults(p.profile),
    }))
  } catch {
    return null
  }
}

/** Check if a string looks like a share string (quick check, no decompression). */
export function isShareString(str: string): boolean {
  const t = str.trim()
  return t.startsWith(HEADER) || t.startsWith(LEGACY_HEADER)
}
