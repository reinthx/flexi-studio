/**
 * commonJsLoader.ts
 *
 * Network-first loader for OverlayPlugin's common.min.js.
 * Strategy: CDN → fallback.
 * Fully silent — never throws, always resolves.
 */

export async function loadCommonJs(): Promise<void> {
  if (window.addOverlayListener && window.startOverlayEvents) {
    return
  }

  const src = await resolve()
  injectScript(src)
}

async function resolve(): Promise<string> {
  if (window.addOverlayListener && window.startOverlayEvents) {
    return ''
  }

  try {
    const res = await fetch('https://overlayplugin.github.io/OverlayPlugin/assets/shared/common.min.js', { cache: 'no-store' })
    if (res.ok) return res.text()
  } catch { /* offline or CDN unreachable */ }

  return ''
}

function injectScript(src: string): void {
  if (!src) return
  const script = document.createElement('script')
  script.textContent = src
  document.head.appendChild(script)
}
