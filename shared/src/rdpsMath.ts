export interface RdpsBuffWindow {
  sourceName: string
  multiplier: number
}

export interface RdpsBuffAllocation {
  sourceName: string
  amount: number
}

export function allocatePercentageBuffDamage(
  damage: number,
  windows: RdpsBuffWindow[],
): RdpsBuffAllocation[] {
  if (!Number.isFinite(damage) || damage <= 0 || windows.length === 0) return []

  const eligible = windows.filter(window =>
    window.sourceName &&
    Number.isFinite(window.multiplier) &&
    window.multiplier > 1,
  )
  if (eligible.length === 0) return []

  const totalMultiplier = eligible.reduce((product, window) => product * window.multiplier, 1)
  if (!Number.isFinite(totalMultiplier) || totalMultiplier <= 1) return []

  const buffDamage = damage - (damage / totalMultiplier)
  if (!Number.isFinite(buffDamage) || buffDamage <= 0) return []

  const totalLog = Math.log(totalMultiplier)
  if (!Number.isFinite(totalLog) || totalLog <= 0) return []

  const bySource = new Map<string, number>()
  for (const window of eligible) {
    const weight = Math.log(window.multiplier) / totalLog
    if (!Number.isFinite(weight) || weight <= 0) continue
    bySource.set(window.sourceName, (bySource.get(window.sourceName) ?? 0) + buffDamage * weight)
  }

  return Array.from(bySource, ([sourceName, amount]) => ({ sourceName, amount }))
}
