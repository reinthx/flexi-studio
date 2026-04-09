import type { BarStyle, Orientation } from './configSchema'

export function resolveBarDimensions(style: BarStyle, orientation: Orientation, containerHeight?: number, autoScale = false) {
  const isHorizontal = orientation === 'horizontal'

  if (isHorizontal) {
    // Horizontal mode: bar thickness controls horizontal size; bars should not shrink vertically.
    return {
      height: '100%',
      width: `${style.height}px`,
      flex: '0 0 auto',
      marginBottom: '0',
      marginRight: `${style.gap}px`,
    }
  }

  // Vertical mode: bar thickness controls height unless autoScale is explicitly enabled.
  if (autoScale && containerHeight && containerHeight > 120) {
    return {
      height: 'auto',
      width: '100%',
      flex: '1 1 20px',
      marginBottom: `${style.gap}px`,
      marginRight: '0',
    }
  }

  return {
    height: `${style.height}px`,
    width: '100%',
    flex: '0 0 auto',
    marginBottom: `${style.gap}px`,
    marginRight: '0',
  }
}