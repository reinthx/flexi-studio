/**
 * externalLink.ts — open http(s) URLs in the user's real browser.
 *
 * Inside ACT the overlay runs in embedded Chromium (CEF), where
 * `target="_blank"` opens another overlay window (or nothing) instead of
 * the default browser. OverlayPlugin offers the
 * `openWebsiteWithDefaultBrowser` handler call for exactly this, so try it
 * first when hosted, then fall back down this chain:
 *
 *   1. overlay `openWebsiteWithDefaultBrowser` handler (modern, then legacy)
 *   2. `window.open(url, '_blank')` — the old in-overlay window behavior
 *   3. copy the URL to the clipboard so it can be pasted into a browser
 *
 * Silent by design: every step degrades gracefully, and anchors using this
 * keep their href/target, so right-click, copy-link, and plain browsers
 * keep working regardless.
 */

interface OverlayHostWindow {
  callOverlayHandler?: (params: Record<string, unknown>) => Promise<unknown>
  OverlayPluginApi?: { callHandler: (json: string, cb?: (r: string) => void) => void }
  open?: (url: string, target?: string, features?: string) => unknown
  navigator?: { clipboard?: { writeText?: (text: string) => Promise<unknown> } }
}

function hostWindow(): OverlayHostWindow | null {
  const w = (globalThis as unknown as { window?: OverlayHostWindow }).window
  return w ?? null
}

/** True when running inside ACT/OverlayPlugin (modern or legacy API present). */
export function isOverlayPluginHost(): boolean {
  const w = hostWindow()
  if (!w) return false
  return typeof w.callOverlayHandler === 'function' || typeof w.OverlayPluginApi?.callHandler === 'function'
}

/**
 * OverlayPlugin answers unknown handler calls with a resolved error object
 * rather than rejecting, so an answered call is NOT proof the URL opened.
 * Worse, in windows without a live host connection (e.g. the editor popup)
 * the call can resolve to null/undefined while doing nothing at all.
 * Treat all of those as failure and keep falling back.
 */
export function resultIndicatesFailure(result: unknown): boolean {
  if (result === null || result === undefined) return true
  if (typeof result === 'string') {
    if (result.trim() === '') return true
    try {
      return resultIndicatesFailure(JSON.parse(result))
    } catch {
      return /error|unknown|not found|no such/i.test(result)
    }
  }
  if (typeof result === 'object') {
    const record = result as Record<string, unknown>
    if (Object.keys(record).some(k => /error/i.test(k))) return true
    try {
      return /unknown|not found|no such|error/i.test(JSON.stringify(record))
    } catch {
      return false
    }
  }
  return false
}

/** Step 2: plain new tab / popup (the old behavior). Returns true if it opened. */
function openNewTab(url: string): boolean {
  try {
    const opened = hostWindow()?.open?.(url, '_blank', 'noopener')
    // window.open returns null when the popup was blocked.
    return opened !== null && opened !== undefined
  } catch {
    return false
  }
}

/** Step 3: last resort — put the URL on the clipboard. */
function copyToClipboard(url: string): void {
  try {
    const write = hostWindow()?.navigator?.clipboard?.writeText
    if (typeof write !== 'function') return
    const result = write(url)
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      ;(result as Promise<unknown>).catch(() => {})
    }
  } catch {
    // ignore — nothing more we can do from here
  }
}

function fallbackChain(url: string): void {
  if (!openNewTab(url)) copyToClipboard(url)
}

/**
 * Open an external URL in the system default browser when possible.
 * Safe to call from a `@click.prevent` handler on an anchor that keeps
 * its href/target for right-click, copy-link, and no-JS cases.
 *
 * `timeoutMs` bounds how long an unresponsive overlay handler can stall the
 * fallback — some hosts never settle unknown calls instead of rejecting.
 */
export function openExternalUrl(url: string, timeoutMs = 1200): void {
  const w = hostWindow()
  if (!w) return

  if (!isOverlayPluginHost()) {
    fallbackChain(url)
    return
  }

  if (typeof w.callOverlayHandler === 'function') {
    let settled = false
    const onFailure = () => {
      if (settled) return
      settled = true
      fallbackChain(url)
    }
    try {
      const result = w.callOverlayHandler({ call: 'openWebsiteWithDefaultBrowser', url })
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        ;(result as Promise<unknown>).then(
          r => {
            if (settled) return
            settled = true
            if (resultIndicatesFailure(r)) fallbackChain(url)
          },
          onFailure,
        )
        setTimeout(() => {
          if (!settled) {
            settled = true
            fallbackChain(url)
          }
        }, timeoutMs)
      }
      return
    } catch {
      onFailure()
      return
    }
  }

  if (typeof w.OverlayPluginApi?.callHandler === 'function') {
    try {
      let answered = false
      w.OverlayPluginApi.callHandler(
        JSON.stringify({ call: 'openWebsiteWithDefaultBrowser', url }),
        result => {
          answered = true
          if (resultIndicatesFailure(result)) fallbackChain(url)
        },
      )
      // Legacy callback may never fire for unknown calls — don't hang forever.
      setTimeout(() => {
        if (!answered) {
          answered = true
          fallbackChain(url)
        }
      }, timeoutMs)
      return
    } catch {
      // fall through to new tab
    }
  }

  fallbackChain(url)
}
