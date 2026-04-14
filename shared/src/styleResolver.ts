/**
 * styleResolver.ts
 *
 * Resolves the final BarStyle for a combatant using the cascade:
 *   Rank 1 → Self → Job → Role → Default
 *
 * Uses deep merge so partial overrides only replace specified fields.
 */

import type { BarFill, BarStyle, Profile, Role } from './configSchema'
import { getRole } from './jobMap'

/**
 * Apply a color tint override to the current fill, preserving fill type and opacity.
 */
function applyFillColor(baseFill: BarFill, overrideColor: string, gradientEndColor: string): BarFill {
  const opacity = baseFill.opacity  // always carry through

  switch (baseFill.type) {
    case 'solid':
      return { type: 'solid', color: overrideColor, opacity }

    case 'gradient':
      return {
        type: 'gradient',
        opacity,
        gradient: {
          type: baseFill.gradient.type,
          angle: baseFill.gradient.angle,
          stops: [
            { position: 0, color: overrideColor },
            { position: 1, color: gradientEndColor },
          ],
        },
      }

    case 'texture':
      return { ...baseFill, texture: { ...baseFill.texture, tintColor: overrideColor } }
  }
}

/**
 * Apply color tints to a fill based on the applyJobColor and applyRoleColor flags.
 * Returns the fill with tints applied, or original if no tints should be applied.
 */
function applyTintsToFill(fill: BarFill, overrides: Profile['overrides'], combatantJob: string): BarFill {
  const isOverride = fill.override ?? false
  const applyJobColor = fill.applyJobColor ?? false
  const applyRoleColor = fill.applyRoleColor ?? false

  // Case 1: Override=false AND both Job and Role unchecked → no tints, show "Go to Colors" behavior
  if (!isOverride && !applyJobColor && !applyRoleColor) {
    return fill
  }

  const role = getRole(combatantJob) as Role

  // If override is true, we start with the explicit color already in 'fill'
  // If override is false, we use whatever is in 'fill' as base (from BarStylePanel)

  // Apply role tint if enabled
  if (applyRoleColor) {
    const roleOverride = overrides.byRole[role]
    const roleEnabled = overrides.byRoleEnabled?.[role] ?? true
    if (roleOverride && roleEnabled && roleOverride.fill?.type === 'solid') {
      const gradEnd = (roleOverride as any).gradientColor ?? '#000000'
      fill = applyFillColor(fill, roleOverride.fill.color, gradEnd)
    }
  }

  // Apply job tint if enabled
  if (applyJobColor) {
    const jobKey = combatantJob.toUpperCase() as keyof typeof overrides.byJob
    const jobOverride = overrides.byJob[jobKey]
    const jobEnabled = overrides.byJobEnabled?.[jobKey] ?? true
    if (jobOverride && jobEnabled && jobOverride.fill?.type === 'solid') {
      const gradEnd = (jobOverride as any).gradientColor ?? '#000000'
      fill = applyFillColor(fill, jobOverride.fill.color, gradEnd)
    }
  }

  return fill
}

export function resolveBarStyle(
  combatantJob: string,
  combatantName: string,
  rank: number,
  profile: Profile,
  selfName: string,
): BarStyle {
  const base = deepClone(profile.default)
  const { overrides } = profile

  // Self can be "YOU" or the actual character name from ACT
  const isSelf = overrides.selfEnabled && (combatantName === selfName || combatantName === 'YOU') && overrides.self

  // Apply tints to fill based on checkbox flags
  base.fill = applyTintsToFill(base.fill, overrides, combatantJob)

  // Apply tints to background based on checkbox flags
  base.bg = applyTintsToFill(base.bg, overrides, combatantJob)

  // Self override — color tint, preserving fill type and opacity
  if (isSelf && overrides.self?.fill?.type === 'solid') {
    const gradEnd = (overrides.self as any).gradientColor ?? '#000000'
    base.fill = applyFillColor(base.fill, overrides.self.fill.color, gradEnd)
  }

  // Rank 1 override (highest priority)
  // Preserve shape so the rank1 fill is always clipped to the bar's edges.
  const { rankIndicator } = profile.global
  let rank1HeightIncrease = 0
  if (rankIndicator.rank1Enabled && rank === 1) {
    const savedShape = deepClone(base.shape)
    // If base fill is texture, save it — deepMerge will overwrite fill with the rank1 solid color
    // and we need to restore texture + apply the color as a tint instead
    const savedTextureFill = base.fill?.type === 'texture' ? deepClone(base.fill) : null

    deepMerge(base, rankIndicator.rank1Style)
    base.shape = savedShape

    // Texture tinting: rank1 fill becomes a tint on the texture, not a fill-type override
    const rank1Fill = rankIndicator.rank1Style?.fill
    if (savedTextureFill && rank1Fill) {
      if (rank1Fill.type === 'solid') {
        base.fill = {
          ...savedTextureFill,
          texture: { ...savedTextureFill.texture, tintColor: rank1Fill.color, tintGradient: undefined },
        }
      } else if (rank1Fill.type === 'gradient') {
        base.fill = {
          ...savedTextureFill,
          texture: { ...savedTextureFill.texture, tintGradient: rank1Fill.gradient, tintColor: undefined },
        }
      }
    }
    
    // Apply height increase (percentage-based)
    rank1HeightIncrease = rankIndicator.rank1HeightIncrease ?? 0
    if (rank1HeightIncrease > 0) {
      base.height = base.height * (1 + rank1HeightIncrease / 100)
    }
  }

  return { ...base, rank1HeightIncrease } as BarStyle & { rank1HeightIncrease: number }
}

// ─── Deep clone / merge ───────────────────────────────────────────────────────

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Recursively merges `source` into `target` in place.
 * Only plain objects are merged — arrays and primitives are replaced.
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key]
    const tgtVal = target[key]
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      deepMerge(tgtVal as object, srcVal as object)
    } else if (srcVal !== undefined) {
      target[key] = srcVal as T[keyof T]
    }
  }
  return target
}
