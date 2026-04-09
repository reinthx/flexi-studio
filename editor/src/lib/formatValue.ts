import type { ValueFormat } from '@shared/configSchema'

export function formatValue(value: number, format: ValueFormat): string {
  if (isNaN(value)) return '---'
  switch (format) {
    case 'raw':        return String(Math.round(value))
    case 'abbreviated':
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
      if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}k`
      return String(Math.round(value))
    case 'formatted':  return Math.round(value).toLocaleString()
  }
}
