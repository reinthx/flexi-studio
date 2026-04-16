/**
 * useBarStyles — shared composable for MeterBar (overlay) and PreviewBar (editor).
 *
 * Extracts all the duplicated computed-style logic (shape, shadow, fill, label,
 * icon, outline) so both bar components stay in sync without copy-paste.
 */
import { computed, useTemplateRef, onMounted, toValue, type MaybeRefOrGetter, watch } from 'vue'
import type { BarStyle, LabelField, Orientation, GradientFill, Role, Profile } from './configSchema'
import { buildFillCss, buildShapeCss, buildOutlineCss, buildDropShadowFilter } from './cssBuilder'
import { getJobIconSrc, getJobInfo } from './jobMap'
import { resolveBarDimensions } from './barDimensions'
import { JOB_COLORS } from './presets'
import { useElementSize, useWindowSize } from '@vueuse/core'

/** Sample a color from a gradient at position t (0–1) by lerping between stops. */
function sampleGradientColor(g: GradientFill, t: number): string {
  const stops = [...g.stops].sort((a, b) => a.position - b.position)
  if (stops.length === 0) return '#000'
  if (stops.length === 1 || t <= stops[0].position) return stops[0].color
  if (t >= stops[stops.length - 1].position) return stops[stops.length - 1].color
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].position && t <= stops[i + 1].position) {
      const range = stops[i + 1].position - stops[i].position
      const local = range > 0 ? (t - stops[i].position) / range : 0
      return lerpColor(stops[i].color, stops[i + 1].color, local)
    }
  }
  return stops[stops.length - 1].color
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b)
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
  return `rgb(${r},${g},${bl})`
}


function parseHex(c: string): [number, number, number] {
  const hex = c.replace('#', '')
  if (hex.length === 3) {
    return [parseInt(hex[0]+hex[0],16), parseInt(hex[1]+hex[1],16), parseInt(hex[2]+hex[2],16)]
  }
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)]
}

export interface BarData {
  name: string
  job: string
  fillFraction: number
  displayValue: string
  displayPct: string
  deaths: string
  crithit: string
  directhit: string
  enchps: string
  maxHit: string
  alpha: number
  rank: number
  isSelf?: boolean
  rank1HeightIncrease?: number
  rank1Glow?: { enabled: boolean; color: string; blur: number }
  rank1ShowCrown?: boolean
  rank1Crown?: { enabled: boolean; icon: string; size: number; offsetX: number; offsetY: number; hAnchor: 'left' | 'right' | 'center'; vAnchor: 'top' | 'middle' | 'bottom' }
}

const FIELD_ROLE_COLORS: Record<string, string> = {
  tank: '#4a90d9', healer: '#52b788', melee: '#e63946',
  ranged: '#f4a261', caster: '#9b5de5', unknown: '#888888',
}

function getRoleFromJob(job: string): string {
  const { role } = getJobInfo(job)
  return role
}


const DEFAULT_ICON_CONFIG = {
  sizeOverride: 0,
  opacity: 1,
  show: true,
  separateRow: false,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  shadow: { enabled: false, color: '#000000', blur: 4, offsetX: 0, offsetY: 1 },
  bgShape: { enabled: false, shape: 'circle' as const, color: '#000000', size: 24, opacity: 0.5 },
}

const DEFAULT_FIELDS: LabelField[] = [
  { id: 'f1', template: '{name}',          hAnchor: 'left',  vAnchor: 'middle', offsetX: 0, offsetY: 0, enabled: true },
  { id: 'f2', template: '{value} ({pct})', hAnchor: 'right', vAnchor: 'middle', offsetX: 0, offsetY: 0, enabled: true },
]

const DEFAULT_LABEL = {
  font: 'Segoe UI',
  size: 12,
  color: '#ffffff',
  fields: DEFAULT_FIELDS,
  shadow: { enabled: true, color: '#000000', blur: 2, offsetX: 0, offsetY: 1, thickness: 1 },
  outline: { enabled: false, color: '#000000', width: 1 },
  iconConfig: DEFAULT_ICON_CONFIG,
  padding: 4,
  gap: 4,
}

/** Compute the CSS position style for a single absolutely-positioned label field. */
function calcFieldStyle(field: LabelField, padding: number, outlineWidth: number, styleConfig: BarStyle, barWidth: number): Record<string, string | number> {
  const ox = field.offsetX ?? 0
  const oy = field.offsetY ?? 0
  const extraPad = outlineWidth
  const maxW = field.maxWidth && field.maxWidth > 0
    ? `${field.maxWidth}px`
    : `calc(100% - ${(padding + extraPad) * 2}px)`
  const style: Record<string, string | number> = {
    position: 'absolute',
    maxWidth: maxW,
    minWidth: 0,
    overflow: 'visible',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: '1.2',
    display: 'flex',
    alignItems: 'center',
  }
  if (field.font) style.fontFamily = field.font
  if (field.fontSize && field.fontSize > 0) style.fontSize = `${field.fontSize}px`
  if (field.opacity !== undefined && field.opacity < 1) style.opacity = String(field.opacity)

  let xTransform = ''
  if (field.hAnchor === 'left') {
    style.left = `${padding + extraPad + ox}px`
  } else if (field.hAnchor === 'right') {
    style.right = `${padding + extraPad - ox}px`
  } else {
    style.left = '50%'
    xTransform = `translateX(calc(-50% + ${ox}px))`
  }

  let yTransform = ''
  if (field.vAnchor === 'top') {
    style.top = `${padding + oy}px`
  } else if (field.vAnchor === 'bottom') {
    style.bottom = `${padding - oy}px`
  } else {
    style.top = '50%'
    yTransform = `translateY(calc(-50% + ${oy}px))`
  }

  const transformParts = [xTransform, yTransform].filter(Boolean)
  
  // Determine rotation: calculate angle from startHeight/endHeight
  let finalRotation = 0
  if (field.rotation) {
    finalRotation = field.rotation
  } else if (field.autoRotation && styleConfig?.shape?.segmentFill?.enabled) {
    const sf = styleConfig.shape.segmentFill
    const sh = sf.startHeight ?? 0
    const eh = sf.endHeight ?? 0
    if (sh && eh && sh !== eh) {
      const ratio = barWidth > 0 ? barWidth : 1
      const deltaH = Math.abs(eh - sh)
      finalRotation = 360 - (Math.atan(deltaH / ratio) * (180 / Math.PI))
    }
  }
  
  if (finalRotation) {
    transformParts.push(`rotate(${finalRotation}deg)`)
    style.transformOrigin = '0% 100%'
    style.overflow = 'hidden'
  }
  
  const transform = transformParts.join(' ')
  if (transform) style.transform = transform

  return style
}

const DEFAULT_SHAPE = {
  leftEdge: 'flat' as const,
  rightEdge: 'flat' as const,
  edgeDepth: 10,
  chamferMode: 'none' as const,
  cornerCuts: { tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } },
  borderRadius: { tl: 3, tr: 3, br: 3, bl: 3 },
  outline: { color: 'rgba(255,255,255,0.15)', thickness: { top: 0, right: 0, bottom: 1, left: 0 } },
  shadow: { enabled: false, color: '#000000', blur: 4, thickness: 0, offsetX: 0, offsetY: 2 },
  fillShadow: { enabled: false, color: '#000000', blur: 4, thickness: 0, offsetX: 0, offsetY: 1 },
}

const DEFAULT_STYLE: BarStyle = {
  fill: { type: 'solid', color: '#4a90d9' },
  bg: { type: 'solid', color: '#1a1a2e' },
  shape: DEFAULT_SHAPE,
  label: DEFAULT_LABEL,
  height: 28,
  gap: 2,
}

export { DEFAULT_ICON_CONFIG, DEFAULT_LABEL, DEFAULT_SHAPE, DEFAULT_STYLE }


/**
 * Generates a triangle shape mask using Start H and End H.
 * Creates a single right-angled triangle: left edge at startH, right edge at endH.
 */
function buildTriangleMask(
  segW: number, gap: number,
  startH: number, endH: number,
  barH: number,
): { url: string } {
  const s = Math.max(2, startH)
  const e = Math.max(2, endH)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${barH}" preserveAspectRatio="none"><polygon points="0,${barH} 100,${barH} 100,${barH - e} 0,${barH - s}"/></svg>`
  return { url: `url("data:image/svg+xml;base64,${btoa(svg)}")` }
}


/**
 * Generates segment overlay for triangle bar.
 */
function buildSegmentsMask(
  segW: number, gap: number,
  startH: number, endH: number,
  barH: number,
  angle: number = 90,
  maxSegments: number = 40,
): { url: string; totalWidth: number } {
  const pitch = segW + gap
  const clamp = (h: number) => Math.max(2, Math.min(h, barH - 2))
  const s = clamp(startH)
  const e = clamp(endH)
  const rad = (angle * Math.PI) / 180
  const cotA = angle === 90 ? 0 : Math.cos(rad) / Math.sin(rad)
  const extraW = Math.ceil(Math.abs(e * cotA))

  const n = maxSegments
  const totalW = n * pitch + extraW

  const shapes = Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 1
    const h = s + (e - s) * t
    const y = barH - h
    const x0 = i * pitch
    const x1 = x0 + segW
    if (cotA === 0) {
      return `<rect x="${x0}" y="${y}" width="${segW}" height="${h}"/>`
    }
    const skew = h * cotA
    return `<polygon points="${x0},${barH} ${x1},${barH} ${x1 + skew},${y} ${x0 + skew},${y}"/>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${barH}" preserveAspectRatio="none"><g fill="white">${shapes}</g></svg>`
  return { url: `url("data:image/svg+xml;base64,${btoa(svg)}")`, totalWidth: totalW }
}

export function useBarStyles(
  bar: MaybeRefOrGetter<BarData>,
  styleConfig: MaybeRefOrGetter<BarStyle>,
  orientation: MaybeRefOrGetter<Orientation>,
  barIndex: MaybeRefOrGetter<number> = () => 0,
  tabLabelConfig: MaybeRefOrGetter<BarLabel | undefined> = () => undefined,
  rank1Config?: MaybeRefOrGetter<{ rank1HeightIncrease?: number; rank1Glow?: { enabled: boolean; color: string; blur: number }; rank1ShowCrown?: boolean; rank1Crown?: { enabled: boolean; icon: string; imageUrl?: string; size: number; offsetX: number; offsetY: number; rotation?: number; hAnchor: 'left' | 'right' | 'center'; vAnchor: 'top' | 'middle' | 'bottom' }; rank1NameStyle?: { enabled: boolean; gradient?: { type: 'linear' | 'radial'; angle: number; stops: Array<{ color: string; position: number }> } }; rank1IconStyle?: { enabled: boolean; glow?: { enabled: boolean; color: string; blur: number }; shadow?: { enabled: boolean; color: string; blur: number }; bgShape?: { enabled: boolean; shape: 'circle' | 'square' | 'rounded' | 'diamond'; color: string; size: number; opacity: number; offsetX: number; offsetY: number } } } | undefined>,
  colorOverrides?: MaybeRefOrGetter<Profile['overrides'] | undefined>,
  barWidth?: MaybeRefOrGetter<number>,
) {
  const sc = () => toValue(styleConfig) ?? DEFAULT_STYLE
  const b = () => toValue(bar)
  const ori = () => toValue(orientation)
  const tabLabel = () => toValue(tabLabelConfig)
  const getColorOverrides = () => toValue(colorOverrides)
  const { width: windowWidth } = useWindowSize()
  const getBarWidth = () => {
    const w = toValue(barWidth)
    if (w !== undefined && w > 0) return w
    return windowWidth.value || 0
  }

  // ── Shape ─────────────────────────────────────────────────────────────────
  const shapeCss = computed(() => buildShapeCss(sc().shape ?? DEFAULT_SHAPE))
  const isClipped = computed(() => 'clipPath' in shapeCss.value)
  const dims = computed(() => resolveBarDimensions(sc(), ori()))
  const r1c = () => toValue(rank1Config)
  const isRank1 = computed(() => b().rank === 1 && r1c())

  // Rank 1 height adjustment
  const rank1HeightAdjustment = computed(() => {
    if (!isRank1.value) return 0
    const r1 = r1c() ?? {}
    const increase = r1.rank1HeightIncrease ?? 0
    if (increase <= 0) return 0
    // dims.value.height is a string like "28px" - parse it
    const baseHeight = parseFloat(String(dims.value.height)) || 28
    return baseHeight * (increase / 100)
  })

  // Rank 1 z-index override (make sure it shows above other bars)
  const rank1ZIndex = computed(() => {
    if (!isRank1.value) return 1
    return 10
  })

  // Rank 1 glow effect
  const rank1GlowStyle = computed(() => {
    if (!isRank1.value) return undefined
    const r1 = r1c()?.rank1Glow
    if (!r1?.enabled) return undefined
    return {
      filter: `drop-shadow(0 0 ${r1.blur ?? 8}px ${r1.color ?? '#FFD700'})`,
    }
  })

  // Rank 1 crown icon
  const rank1ShowCrown = computed(() => {
    if (!isRank1.value) return false
    return r1c()?.rank1ShowCrown ?? false
  })

  // Rank 1 crown icon (emoji or image URL)
  const rank1CrownIcon = computed(() => {
    if (!isRank1.value) return ''
    const crown = r1c()?.rank1Crown
    if (!crown?.enabled) return ''
    if (crown.imageUrl) return crown.imageUrl
    return crown.icon ?? '👑'
  })

  // Rank 1 crown is image (not emoji)
  const rank1CrownIsImage = computed(() => {
    if (!isRank1.value) return false
    const crown = r1c()?.rank1Crown
    return crown?.enabled === true && !!crown?.imageUrl
  })

  // Rank 1 crown style
  const rank1CrownStyle = computed(() => {
    if (!isRank1.value) return undefined
    const crown = r1c()?.rank1Crown
    if (!crown?.enabled) return undefined

    const size = crown.size ?? 20
    const offsetX = crown.offsetX ?? 2
    const offsetY = crown.offsetY ?? 0
    const rotation = crown.rotation ?? 0
    const hAnchor = crown.hAnchor ?? 'left'
    const vAnchor = crown.vAnchor ?? 'middle'
    const isImg = !!crown.imageUrl

    // Calculate horizontal position
    let left: string | undefined
    let right: string | undefined
    let transforms: string[] = []
    if (hAnchor === 'left') {
      left = `${offsetX}px`
    } else if (hAnchor === 'right') {
      right = `${offsetX}px`
    } else {
      left = '50%'
      transforms.push(`translateX(calc(-50% + ${offsetX}px))`)
    }

    // Vertical positioning
    let top: string | undefined
    let bottom: string | undefined
    if (vAnchor === 'top') {
      top = `${offsetY}px`
    } else if (vAnchor === 'bottom') {
      bottom = `${Math.abs(offsetY)}px`
    } else {
      top = '50%'
      transforms.push(`translateY(calc(-50% + ${offsetY}px))`)
    }

    if (rotation) transforms.push(`rotate(${rotation}deg)`)

    const baseStyle = {
      position: 'absolute' as const,
      left,
      right,
      top,
      bottom,
      transform: transforms.length ? transforms.join(' ') : undefined,
      zIndex: 20,
    }

    if (isImg) {
      return {
        ...baseStyle,
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain' as const,
      }
    }

    return {
      ...baseStyle,
      fontSize: `${size}px`,
    }
  })

  // Rank 1 name gradient style
  const rank1NameGradientStyle = computed(() => {
    if (!isRank1.value) return undefined
    const ns = r1c()?.rank1NameStyle
    if (!ns?.enabled || !ns?.gradient) return undefined
    const g = ns.gradient
    const stops = (g.stops ?? [])
      .map(s => `${s.color} ${(s.position * 100).toFixed(1)}%`)
      .join(', ')
    if (!stops) return undefined
    const angle = g.angle ?? 90
    const bg = g.type === 'linear'
      ? `linear-gradient(${angle}deg, ${stops})`
      : `radial-gradient(circle, ${stops})`
    return {
      background: bg,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    }
  })

  // rank1NameGlowStyle removed — glow moved to rank1IconStyle

  const outlineTarget = computed(() => sc().shape?.outline?.target ?? 'both')
  const outlineCss = computed(() => buildOutlineCss(sc().shape?.outline ?? DEFAULT_SHAPE.outline))

  // ── Shape layer ───────────────────────────────────────────────────────────
  const shapeLayerStyle = computed(() => ({
    position: 'absolute' as const, inset: '0', zIndex: 1,
    ...(isClipped.value ? { clipPath: shapeCss.value.clipPath } : {}),
    ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
    ...((outlineTarget.value === 'bg' || outlineTarget.value === 'both') ? outlineCss.value : {}),
  }))

  // ── Background shadow ─────────────────────────────────────────────────────
  const bgShadowDirectionalClip = computed(() => {
    const s = sc().shape?.shadow
    const insetTop = sc().shape?.fillInsetTop ?? 0
    const baseInset = insetTop ? { top: `${insetTop}px`, left: '0', right: '0', bottom: '0' } : { inset: '0' }
    const base = { position: 'absolute' as const, ...baseInset, zIndex: 0 }
    if (!s?.enabled) return base
    const oX = s.offsetX, oY = s.offsetY
    const t = oY > 0 ? '0px' : oY < 0 ? '-9999px' : '0px'
    const bv = oY < 0 ? '0px' : oY > 0 ? '-9999px' : '0px'
    const l = oX > 0 ? '0px' : oX < 0 ? '-9999px' : '0px'
    const r = oX < 0 ? '0px' : oX > 0 ? '-9999px' : '0px'
    if (oX === 0 && oY === 0) return base
    return { ...base, clipPath: `inset(${t} ${r} ${bv} ${l})` }
  })

  const bgShadowStyle = computed(() => {
    const s = sc().shape?.shadow
    const base = { position: 'absolute' as const, inset: '0' }
    if (!s?.enabled) return base

    if (isClipped.value) {
      const cp = shapeCss.value.clipPath!
      const innerPoints = cp.slice(8, -1)
      return {
        ...base,
        filter: buildDropShadowFilter(s.offsetX, s.offsetY, s.blur, s.color, s.thickness ?? 0),
        clipPath: `polygon(evenodd, -9999px -9999px, 9999px -9999px, 9999px 9999px, -9999px 9999px, ${innerPoints})`,
      }
    }

    return {
      ...base,
      ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
      boxShadow: `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.thickness ?? 0}px ${s.color}`,
    }
  })

  const bgShadowSourceStyle = computed(() => ({
    position: 'absolute' as const, inset: '0',
    background: '#000',
    clipPath: shapeCss.value.clipPath,
  }))

  // ── Background ────────────────────────────────────────────────────────────
  const isTextureBg = computed(() => sc().bg?.type === 'texture')

  const bgStyle = computed(() => {
    const insetTop = sc().shape?.fillInsetTop ?? 0
    const sf = sc().shape?.segmentFill
    const segMask = sf?.enabled ? (() => {
      const w = sf.segmentWidth ?? 8
      const g = sf.gap ?? 2
      const a = sf.angle ?? 90
      return { maskImage: `repeating-linear-gradient(${a}deg, black 0px, black ${w}px, transparent ${w}px, transparent ${w + g}px)`, WebkitMaskImage: `repeating-linear-gradient(${a}deg, black 0px, black ${w}px, transparent ${w}px, transparent ${w + g}px)` }
    })() : {}
    const triClip = (() => {
      if (!sf?.enabled || !sf.startHeight || !sf.endHeight) return {}
      const barH = sc().height ?? 28
      const sPct = (sf.startHeight / barH) * 100
      const ePct = (sf.endHeight / barH) * 100
      const polygon = `polygon(0% 100%, 100% 100%, 100% ${100 - ePct}%, 0% ${100 - sPct}%)`
      return { clipPath: polygon, WebkitClipPath: polygon }
    })()
    return {
      position: 'absolute' as const,
      ...(insetTop ? { top: `${insetTop}px`, left: '0', right: '0', bottom: '0' } : { inset: '0' }),
      ...(isTextureBg.value ? {} : buildFillCss(sc().bg, bi(), barHeightWithGap.value)),
      ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
      ...segMask,
      ...triClip,
    }
  })

  /** Inner div for texture backgrounds — for Paginate mode, ensures tiling works across bars. */
  const bgTextureInnerStyle = computed(() => {
    if (!isTextureBg.value) return undefined
    const texture = sc().bg.texture
    const isPaginate = texture.repeat === 'paginate'
    const height = barHeightWithGap.value
    const base = buildFillCss(sc().bg, bi(), barHeightWithGap.value)
    
    // For Paginate mode, use repeat so it tiles across all expanded bars
    const repeat = isPaginate ? 'repeat' : base.backgroundRepeat
    
    return {
      position: 'absolute' as const,
      top: '0',
      left: '0',
      height: `${height}px`,
      width: '100%',
      backgroundImage: base.backgroundImage,
      backgroundSize: base.backgroundSize,
      backgroundRepeat: repeat,
      backgroundPosition: base.backgroundPosition,
      opacity: base.opacity,
      mixBlendMode: base.mixBlendMode,
      ...(base.backgroundColor ? { backgroundColor: base.backgroundColor } : {}),
      ...(base.backgroundBlendMode ? { backgroundBlendMode: base.backgroundBlendMode } : {}),
    }
  })

  // ── Fill shadow + fill ────────────────────────────────────────────────────
  const fillShadowBoundsStyle = computed(() => {
    const insetTop = sc().shape?.fillInsetTop ?? 0
    const base = insetTop
      ? { position: 'absolute' as const, top: `${insetTop}px`, left: '0', right: '0', bottom: '0', zIndex: 1 }
      : { position: 'absolute' as const, inset: '0', zIndex: 1 }
    if (isClipped.value) {
      return { ...base, clipPath: shapeCss.value.clipPath }
    } else if (shapeCss.value.borderRadius) {
      return { ...base, borderRadius: shapeCss.value.borderRadius, overflow: 'hidden' as const }
    }
    return base
  })

  const fillShadowWrapStyle = computed(() => {
    const s = sc().shape?.fillShadow
    const base = { position: 'absolute' as const, inset: '0' }
    if (!s?.enabled) return base
    return {
      ...base,
      filter: buildDropShadowFilter(s.offsetX, s.offsetY, s.blur, s.color, s.thickness ?? 0),
    }
  })

  const isHorizontal = computed(() => ori() === 'horizontal')
  const bi = () => toValue(barIndex) ?? 0
  const barHeightWithGap = computed(() => {
    const style = sc()
    return (style.height ?? 28) + (style.gap ?? 2)
  })

  const isTextureFill = computed(() => sc().fill?.type === 'texture')

  const fillStyle = computed(() => {
    const frac = b().fillFraction
    const idx = bi()
    const bhg = barHeightWithGap.value
    const fillCss = isTextureFill.value ? {} : buildFillCss(sc().fill, idx, bhg)
    return {
      position: 'absolute' as const,
      ...(isHorizontal.value
        ? { bottom: '0', left: '0', right: '0', height: frac >= 1 ? '100%' : `${frac * 100}%` }
        : { top: '0', left: '0', bottom: '0', ...(frac >= 1 ? { right: '0' } : { width: `${frac * 100}%` }) }),
      ...fillCss,
      // Texture fills use an inner div to avoid rubberband stretch in CEF
      ...(isTextureFill.value ? { overflow: 'hidden' as const } : {}),
      ...(isClipped.value ? { clipPath: shapeCss.value.clipPath } : {}),
      ...(shapeCss.value.borderRadius ? { borderRadius: shapeCss.value.borderRadius } : {}),
      ...((outlineTarget.value === 'fill' || outlineTarget.value === 'both') ? outlineCss.value : {}),
      ...(() => {
        const sf = sc().shape?.segmentFill
        if (!sf?.enabled) return {}
        const w = sf.segmentWidth ?? 8
        const g = sf.gap ?? 2
        const sh = sf.startHeight
        const eh = sf.endHeight
        if (sh && eh) {
          const barH = sc().height ?? 28
          const a = sf.angle ?? 90
          const { url: maskUrl } = buildTriangleMask(w, g, sh, eh, barH)
          const s = sh
          const e = eh
          const ePct = ((e * frac) / barH) * 100
          const triClip = `polygon(0% 100%, 100% 100%, 100% ${100 - ePct}%)`
          const segMask = `repeating-linear-gradient(to right, black 0px, black ${w}px, transparent ${w}px, transparent ${w + g}px)`
          return {
            clipPath: triClip, WebkitClipPath: triClip,
            maskImage: segMask, WebkitMaskImage: segMask,
          }
        }
        const a = sf.angle ?? 90
        const mask = `repeating-linear-gradient(${a}deg, black 0px, black ${w}px, transparent ${w}px, transparent ${w + g}px)`
        return { maskImage: mask, WebkitMaskImage: mask }
      })(),
    }
  })

  /** Inner div for texture fills — sized to the full bar so the image never stretches with fill width. */
  const fillTextureInnerStyle = computed(() => {
    if (!isTextureFill.value) return undefined
    const frac = b().fillFraction
    const idx = bi()
    const bhg = barHeightWithGap.value
    return {
      position: 'absolute' as const,
      top: '0',
      left: '0',
      // Expand to full bar width/height: parent is frac% of bar, so inner = 1/frac * 100%
      ...(isHorizontal.value
        ? { width: '100%', height: frac > 0 ? `${(1 / frac) * 100}%` : '100%', bottom: '0' }
        : { height: '100%', width: frac > 0 ? `${(1 / frac) * 100}%` : '100%' }),
      ...buildFillCss(sc().fill, idx, bhg),
    }
  })

  // ── Label ─────────────────────────────────────────────────────────────────
  const label = computed(() => {
    const tab = tabLabel()
    if (tab) return { ...DEFAULT_LABEL, ...tab }
    return { ...DEFAULT_LABEL, ...sc().label }
  })

  const labelOutlineShadow = computed(() => {
    const l = label.value
    if (!l.outline?.enabled) return ''
    const shift = l.outline.width ?? 0
    return Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2
      const x = Math.round(Math.cos(angle) * shift)
      const y = Math.round(Math.sin(angle) * shift)
      const color = l.outline?.gradient
        ? sampleGradientColor(l.outline.gradient, i / 8)
        : (l.outline?.color ?? '#000000')
      return `${x}px ${y}px 0 ${color}`
    }).join(', ')
  })

  const labelStyle = computed(() => {
    const l = label.value
    const textTransform = l.textTransform || 'none'
    return {
      position: 'absolute' as const,
      left: 0, right: 0, top: 0, bottom: 0, zIndex: 2,
      fontFamily: l.font,
      fontSize: `${l.size}px`,
      color: l.color,
      userSelect: 'none' as const,
      textTransform,
      pointerEvents: 'none' as const,
    }
  })

  /** Enabled fields with pre-computed position styles. */
  const processedFields = computed(() => {
    const l = label.value
    const padding = l.padding ?? 4
    const raw = l.fields?.length ? l.fields : DEFAULT_FIELDS
    const enabled = raw.filter(f => f.enabled)
    const outlineWidth = l.outline?.enabled ? (l.outline?.width ?? 0) : 0
    const labelColor = l.color ?? '#ffffff'
    const overrides = getColorOverrides()
    const job = b().job
    const role = getRoleFromJob(job)
    const isSelf = b().isSelf ?? false
    
    return enabled.map((f, index) => {
      const bw = getBarWidth()
      const style = calcFieldStyle(f, padding, outlineWidth, sc(), bw)
      let fieldGradientStyle: string | undefined

      // Apply per-field color override based on colorMode
      if (f.colorMode === 'custom' && f.color) {
        style.color = f.color
        if (f.gradient?.stops?.length) {
          const stops = f.gradient.stops.map(s => `${s.color} ${(s.position * 100).toFixed(1)}%`).join(', ')
          const gradType = f.gradient.type === 'linear' ? `${f.gradient.angle ?? 90}deg` : 'circle'
          fieldGradientStyle = f.gradient.type === 'linear'
            ? `linear-gradient(${gradType}, ${stops})`
            : `radial-gradient(${gradType}, ${stops})`
        }
      } else if (f.colorMode === 'job') {
        const jobKey = job.toUpperCase() as keyof NonNullable<typeof overrides>['byJob']
        const jobOverride = overrides?.byJob?.[jobKey]
        const jobEnabled = overrides?.byJobEnabled?.[jobKey] ?? true
        const c = (jobEnabled && (jobOverride as any)?.fill?.color)
          ? (jobOverride as any).fill.color
          : (JOB_COLORS[job.toUpperCase()] ?? '#888888')
        style.color = c
        if (f.gradient !== undefined) {
          const color2 = f.gradient.stops?.[1]?.color ?? '#000000'
          const angle = f.gradient.angle ?? 90
          fieldGradientStyle = `linear-gradient(${angle}deg, ${c} 0%, ${color2} 100%)`
        }
      } else if (f.colorMode === 'role') {
        const roleKey = role as Role
        const roleOverride = overrides?.byRole?.[roleKey]
        const roleEnabled = overrides?.byRoleEnabled?.[roleKey] ?? true
        const c = (roleEnabled && (roleOverride as any)?.fill?.color)
          ? (roleOverride as any).fill.color
          : (FIELD_ROLE_COLORS[role] ?? '#888888')
        style.color = c
        if (f.gradient !== undefined) {
          const color2 = f.gradient.stops?.[1]?.color ?? '#000000'
          const angle = f.gradient.angle ?? 90
          fieldGradientStyle = `linear-gradient(${angle}deg, ${c} 0%, ${color2} 100%)`
        }
      } else {
        // Default to label's main color
        style.color = labelColor
      }

      // selfMode: post-process overlay — combinable with any colorMode
      // When selfMode is true and bar is self, override color with Self style override color
      if (f.selfMode && isSelf) {
        const selfC = (overrides?.selfEnabled && (overrides?.self as any)?.fill?.color)
          ? (overrides?.self as any).fill.color
          : undefined
        if (selfC) {
          style.color = selfC
          if (f.selfGradient !== undefined) {
            const color2 = (f.selfGradient as any).stops?.[1]?.color ?? '#000000'
            const angle = (f.selfGradient as any).angle ?? 90
            fieldGradientStyle = `linear-gradient(${angle}deg, ${selfC} 0%, ${color2} 100%)`
          } else {
            // selfMode without selfGradient clears any gradient set by colorMode
            fieldGradientStyle = undefined
          }
        }
      }

      return {
        id: f.id,
        template: f.template,
        hAnchor: f.hAnchor,
        isFirstField: index === 0,
        style,
        gradientStyle: fieldGradientStyle,
      }
    })
  })

  const textStyle = computed(() => {
    const l = label.value
    if (!l.shadow?.enabled) return undefined
    return `drop-shadow(${l.shadow.offsetX}px ${l.shadow.offsetY}px ${l.shadow.blur}px ${l.shadow.color})`
  })

  const gradientTextStyle = computed(() => {
    const g = label.value.gradient
    if (!g) return undefined
    const stops = g.stops
      .map(s => `${s.color} ${(s.position * 100).toFixed(1)}%`)
      .join(', ')
    const bg = g.type === 'linear'
      ? `linear-gradient(${g.angle}deg, ${stops})`
      : `radial-gradient(circle, ${stops})`
    return {
      background: bg,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    }
  })

  // ── Death indicator ────────────────────────────────────────────────────────
  const showDeath = computed(() => {
    const l = label.value
    return l.separateRowDeaths && b().deaths !== '0'
  })

  const deathText = computed(() => {
    const d = b().deaths
    return d !== '0' ? `💀${d}` : ''
  })

  const deathStyle = computed(() => {
    const l = label.value
    const ox = l.deathOffsetX ?? 0
    const oy = l.deathOffsetY ?? 0
    return {
      position: 'absolute' as const,
      zIndex: 3,
      left: '50%',
      top: '50%',
      transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`,
      fontSize: `${l.deathSize ?? 12}px`,
      opacity: String(l.deathOpacity ?? 1),
      lineHeight: '1',
      pointerEvents: 'none' as const,
      filter: textStyle.value,
    }
  })

  // ── Icon ──────────────────────────────────────────────────────────────────
  const iconConfig = computed(() => ({ ...DEFAULT_ICON_CONFIG, ...label.value.iconConfig }))

  const iconSrc = computed(() => getJobIconSrc(b().job))

  const showIcon = computed(() => iconConfig.value.show !== false)

  const iconSize = computed(() => {
    const cfg = iconConfig.value
    let size = cfg.sizeOverride && cfg.sizeOverride > 0
      ? cfg.sizeOverride
      : Math.round(label.value.size * 1.4)
    if (b().job === 'LB') size = Math.round(size * 0.68)
    return size
  })

  const iconOffsetX = computed(() => iconConfig.value.offsetX ?? 0)
  const iconOffsetY = computed(() => iconConfig.value.offsetY ?? 0)

  // Used for separateRow offset only (rotation applied to icon image separately)
  const iconContainerStyle = computed(() => {
    const x = iconOffsetX.value
    const y = iconOffsetY.value
    const parts: string[] = []
    if (x || y) parts.push(`translate(${x}px, ${y}px)`)
    return parts.length ? { transform: parts.join(' ') } : undefined
  })

  /** Standalone absolute position for inline (non-separateRow) icon. */
  const iconInlineStyle = computed(() => {
    const x = iconConfig.value.offsetX ?? 0
    const y = iconConfig.value.offsetY ?? 0
    const transform = `translate(${x}px, calc(-50% + ${y}px))`
    return {
      position: 'absolute' as const,
      left: '0',
      top: '50%',
      transform,
      zIndex: 2,
      display: 'inline-flex' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      pointerEvents: 'none' as const,
    }
  })

  /** Style applied only to the icon image element (rotation + filters) */
  const iconImageStyle = computed(() => {
    const rot = iconConfig.value.rotation ?? 0
    const cfg = iconConfig.value
    const filters: string[] = []
    if (cfg.shadow?.enabled) {
      filters.push(`drop-shadow(${cfg.shadow.offsetX}px ${cfg.shadow.offsetY}px ${cfg.shadow.blur}px ${cfg.shadow.color})`)
    }
    const co = (cfg as any).classOutline
    if (co?.enabled && co.width > 0) {
      const w = co.width
      const c = co.color ?? JOB_COLORS[b().job.toUpperCase()] ?? '#888888'
      for (let dx = -w; dx <= w; dx++) {
        for (let dy = -w; dy <= w; dy++) {
          if (dx === 0 && dy === 0) continue
          filters.push(`drop-shadow(${dx}px ${dy}px 0 ${c})`)
        }
      }
    }
    // Rank1 icon glow — merged as additional drop-shadow filters
    const r1icon = isRank1.value ? r1c()?.rank1IconStyle : undefined
    if (r1icon?.enabled && r1icon.glow?.enabled) {
      const g = r1icon.glow
      filters.push(`drop-shadow(0 0 ${g.blur ?? 8}px ${g.color ?? '#FFD700'})`)
    }
    // Rank1 icon shadow
    if (r1icon?.enabled && r1icon.shadow?.enabled && (r1icon.shadow.blur ?? 0) > 0) {
      filters.push(`drop-shadow(0 0 ${r1icon.shadow.blur}px ${r1icon.shadow.color ?? '#FFD700'})`)
    }
    return {
      transform: rot ? `rotate(${rot}deg)` : undefined,
      filter: filters.length ? filters.join(' ') : undefined,
      opacity: cfg.opacity !== undefined ? String(cfg.opacity) : undefined,
    }
  })

  const iconOutlineStyle = computed(() => {
    const o = iconConfig.value.outline
    if (!o?.enabled || !o.width) return undefined
    const w = o.width
    const c = o.color
    const dirs: string[] = []
    for (let dx = -w; dx <= w; dx++) {
      for (let dy = -w; dy <= w; dy++) {
        if (dx === 0 && dy === 0) continue
        dirs.push(`drop-shadow(${dx}px ${dy}px 0 ${c})`)
      }
    }
    return { filter: dirs.join(' ') }
  })

  const iconBgOutlineStyle = computed(() => {
    const o = iconConfig.value.outline
    if (!o?.enabled || !o.width) return undefined
    return { boxShadow: `0 0 0 ${o.width}px ${o.color}` }
  })

  const iconBgStyle = computed(() => {
    // Rank1 bgShape override takes priority
    const r1icon = isRank1.value ? r1c()?.rank1IconStyle : undefined
    const bg = (r1icon?.enabled && r1icon.bgShape?.enabled) ? r1icon.bgShape : iconConfig.value.bgShape
    if (!bg?.enabled) return {}
    const size = bg.size ?? 24
    const isDiamond = bg.shape === 'diamond'
    let shape: Record<string, string> = {}
    switch (bg.shape) {
      case 'circle':
        shape = { borderRadius: '50%' }
        break
      case 'square':
        shape = { borderRadius: '0' }
        break
      case 'rounded':
        shape = { borderRadius: `${size * 0.15}px` }
        break
      case 'diamond':
        shape = { borderRadius: '2px' }
        break
    }
    const ox = bg.offsetX ?? 0
    const oy = bg.offsetY ?? 0
    return {
      width: `${size}px`,
      height: `${size}px`,
      background: bg.color,
      opacity: String(bg.opacity),
      transform: (ox || oy) && !isDiamond
        ? `translate(${ox}px, ${oy}px)`
        : undefined,
      ...shape,
    }
  })

  const iconBgDiamondStyle = computed(() => {
    const r1icon = isRank1.value ? r1c()?.rank1IconStyle : undefined
    const bg = (r1icon?.enabled && r1icon.bgShape?.enabled) ? r1icon.bgShape : iconConfig.value.bgShape
    if (!bg?.enabled || bg.shape !== 'diamond') return {}
    const size = bg.size ?? 24
    const ox = bg.offsetX ?? 0
    const oy = bg.offsetY ?? 0
    return {
      transform: `translate(${ox}px, ${oy}px) rotate(45deg)`,
      width: `${size}px`,
      height: `${size}px`,
    }
  })

  const iconFallback = computed(() => {
    const info = getJobInfo(b().job)
    const ROLE_COLORS: Record<string, string> = {
      tank: '#4a90d9', healer: '#52b788', melee: '#e63946',
      ranged: '#f4a261', caster: '#9b5de5', unknown: '#888',
    }
    const bg = ROLE_COLORS[info.role] ?? '#888'
    const txt = b().job.toUpperCase().slice(0, 3)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="3" fill="${bg}"/><text x="10" y="14" font-family="'Segoe UI',sans-serif" font-size="7" font-weight="bold" fill="white" text-anchor="middle">${txt}</text></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })

  return {
    // Shape
    shapeCss, isClipped, dims, isHorizontal,
    outlineTarget, outlineCss,
    shapeLayerStyle,
    // Shadow
    bgShadowDirectionalClip, bgShadowStyle, bgShadowSourceStyle,
    // Background + fill
    bgStyle, bgTextureInnerStyle,
    fillShadowBoundsStyle, fillShadowWrapStyle, fillStyle, fillTextureInnerStyle,
    // Label
    label, labelStyle, labelOutlineShadow, processedFields, textStyle, gradientTextStyle,
    // Death indicator
    showDeath, deathText, deathStyle,
    // Icon
    iconConfig, iconSrc, showIcon, iconSize,
    iconOffsetX, iconOffsetY,
    iconContainerStyle, iconInlineStyle, iconImageStyle,
    iconOutlineStyle, iconBgOutlineStyle, iconBgStyle, iconBgDiamondStyle,
    iconFallback,
    // Rank 1
    rank1HeightAdjustment, rank1ZIndex, rank1GlowStyle, rank1ShowCrown, rank1CrownStyle, rank1CrownIcon, rank1CrownIsImage, rank1NameGradientStyle, isRank1,
  }
}
