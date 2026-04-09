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

const HEADER = 'FLEXI1:'
const LEGACY_HEADER = 'ACTFLEXI1:'

// ── Export-time image optimization ──
// Only reduce quality, never downscale — smaller dimensions can cause
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

/** Replace known data URLs with short tokens in a JSON string. */
function tokenize(json: string): string {
  for (const [src, token] of textureSrcToToken) {
    json = json.replaceAll(JSON.stringify(src), JSON.stringify(token))
  }
  for (const [src, token] of iconSrcToToken) {
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
  w.write(data)
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
  w.write(data)
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

// ── Public API ──

/** Encode profile(s) to a compact share string. */
export async function encodeShareString(presets: Array<{ name: string; profile: any }>): Promise<string> {
  let json = tokenize(JSON.stringify(presets))
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
    const decompressed = await inflate(fromBase64url(b64))
    let json = new TextDecoder().decode(decompressed)
    json = restoreAssets(json)
    json = detokenize(json)
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** Check if a string looks like a share string (quick check, no decompression). */
export function isShareString(str: string): boolean {
  const t = str.trim()
  return t.startsWith(HEADER) || t.startsWith(LEGACY_HEADER)
}
