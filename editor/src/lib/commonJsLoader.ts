/**
 * No-op in editor mode - common.min.js is already loaded by index.html.
 * This function exists for API compatibility with overlay mode.
 */
export async function loadCommonJs(): Promise<void> {
  // In dev, the mock bridge handles everything — no need for common.min.js
  if (import.meta.env.DEV) return

  // Editor already loads common.min.js via <script> tag in index.html
  // Just verify it's available
  if (!window.addOverlayListener) {
    console.warn('[act-flexi editor] common.min.js not loaded - OverlayPlugin API unavailable')
  }
}
