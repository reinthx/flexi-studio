import { computed } from 'vue'
import type { HeaderConfig, GlobalConfig } from './configSchema'
import { buildFillCss } from './cssBuilder'

export function useHeaderStyles(
  config: () => HeaderConfig,
  global: () => GlobalConfig | undefined,
  isFooter: () => boolean = () => false,
) {
  const style = computed(() => {
    const conf = config()
    const glob = global() ?? {}
    const isFooterVal = isFooter()
    const isTop = !isFooterVal
    
    const borderRadius = conf.borderRadius ?? 0
    const windowBorder = glob?.windowBorder
    
    let radius = borderRadius
    if (windowBorder?.enabled && windowBorder.radius > 0) {
      // Always inherit the window corner radius so the header background
      // doesn't bleed over rounded window corners (black corner artifact).
      const winR = windowBorder.radius
      if (isTop || isFooterVal) {
        radius = borderRadius > 0 ? Math.min(borderRadius, winR) : winR
      }
    }
    
    let radiusStyle: Record<string, string> = {}
    if (radius > 0) {
      if (isTop) {
        radiusStyle = { borderRadius: `${radius}px ${radius}px 0 0` }
      } else {
        radiusStyle = { borderRadius: `0 0 ${radius}px ${radius}px` }
      }
    }
    
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 6px',
      height: `${conf.size + 16}px`,
      fontFamily: conf.font,
      fontSize: `${conf.size}px`,
      color: conf.color,
      ...buildFillCss(conf.background),
      userSelect: 'none' as const,
      ...radiusStyle,
    }
  })

  return { style }
}
