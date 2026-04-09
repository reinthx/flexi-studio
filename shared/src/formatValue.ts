/**
 * formatValue.ts
 *
 * Formats numeric values with appropriate units (k/d/m for thousands/millions/billions)
 */

export type FormatType = 'raw' | 'abbreviated' | 'formatted'

export function formatValue(value: number, format: FormatType = 'abbreviated'): string {
  if (!value && value !== 0) return '---'

  if (format === 'raw') {
    return String(Math.round(value))
  }

  if (format === 'formatted') {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  // Abbreviated format with k/m/b
  if (value >= 1e9) {
    return (value / 1e9).toFixed(1) + 'b'
  } else if (value >= 1e6) {
    return (value / 1e6).toFixed(1) + 'm'
  } else if (value >= 1e3) {
    return (value / 1e3).toFixed(1) + 'k'
  } else {
    return String(Math.round(value))
  }
}
