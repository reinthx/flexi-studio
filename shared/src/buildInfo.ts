/**
 * buildInfo.ts — build stamp injected at Vite build time.
 *
 * Both `editor/vite.config.ts` and `overlay/vite.config.ts` define the
 * `__FLEXI_BUILD__` global via `define:`. Anything without a build (dev
 * server before the config change, unit tests) falls back to `dev`.
 */

export interface FlexiBuildInfo {
  /** package version, e.g. "0.1.0" */
  version: string
  /** full 40-char git SHA, or "dev" when unavailable */
  sha: string
  /** 7-char short SHA, or "dev" */
  shortSha: string
  /** ISO build timestamp */
  time: string
  /** repo URL, e.g. "https://github.com/reinthx/flexi-studio" */
  repo: string
}

declare const __FLEXI_BUILD__: FlexiBuildInfo | undefined

const FALLBACK: FlexiBuildInfo = {
  version: 'dev',
  sha: 'dev',
  shortSha: 'dev',
  time: '',
  repo: 'https://github.com/reinthx/flexi-studio',
}

export function getBuildInfo(): FlexiBuildInfo {
  try {
    // NOTE: must read __FLEXI_BUILD__ as a bare identifier (typeof guard).
    // Vite's `define` only substitutes bare identifiers — it does NOT
    // replace property access like `globalThis.__FLEXI_BUILD__`, which is
    // why the badge previously always fell back to "dev" in prod builds.
    if (typeof __FLEXI_BUILD__ !== 'undefined' && __FLEXI_BUILD__) {
      const info = __FLEXI_BUILD__ as Partial<FlexiBuildInfo>
      return {
        version: info.version ?? FALLBACK.version,
        sha: info.sha ?? FALLBACK.sha,
        shortSha: info.shortSha ?? FALLBACK.shortSha,
        time: info.time ?? '',
        repo: info.repo ?? FALLBACK.repo,
      }
    }
  } catch {
    // ignore — fall through to dev fallback
  }
  return { ...FALLBACK }
}

/** e.g. https://github.com/reinthx/flexi-studio/commit/<sha> — null when unknown. */
export function getBuildCommitUrl(info?: FlexiBuildInfo): string | null {
  const b = info ?? getBuildInfo()
  if (!b.sha || b.sha === 'dev' || b.sha === 'unknown') return null
  return `${b.repo.replace(/\/$/, '')}/commit/${b.sha}`
}

/** Short label for badges, e.g. "v0.1.0 · abc1234" or "dev". */
export function getBuildLabel(info?: FlexiBuildInfo): string {
  const b = info ?? getBuildInfo()
  if (b.sha === 'dev' && b.version === 'dev') return 'dev'
  if (b.shortSha && b.shortSha !== 'dev') return `v${b.version} · ${b.shortSha}`
  return `v${b.version}`
}
