import { resolve, extname, basename, relative } from 'path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:custom-fonts'
const RESOLVED_ID = '\0virtual:custom-fonts'

const FONT_EXTS = ['.ttf', '.woff', '.woff2', '.otf']

const MIME: Record<string, string> = {
  ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2', otf: 'font/otf',
}

const FONT_PUBLIC_PREFIX = '/assets/fonts'

interface CustomFontsOptions {
  publicPath?: string
}

/**
 * Collect font files from one or more directories.
 * Later dirs win on name collision (user dir overrides built-in dir).
 */
function collectFonts(fontsDirs: string[], publicPath: string): Record<string, string> {
  const fonts: Record<string, string> = {}
  const pathPrefix = publicPath.replace(/\/$/, '')
  for (const dir of fontsDirs) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      const fp = resolve(dir, file)
      if (!statSync(fp).isFile()) continue
      const ext = extname(file).toLowerCase()
      if (!FONT_EXTS.includes(ext)) continue
      const name = basename(file, ext)
      fonts[name] = `${pathPrefix}/${file}`
    }
  }
  return fonts
}

export function normalizeFontRequestUrl(url: string | undefined): string {
  const rawPath = (url ?? '').split('?')[0].split('#')[0]
  const withoutPrefix = rawPath.startsWith(FONT_PUBLIC_PREFIX)
    ? rawPath.slice(FONT_PUBLIC_PREFIX.length)
    : rawPath
  const withoutLeadingSlash = withoutPrefix.replace(/^\/+/, '')
  try {
    return decodeURIComponent(withoutLeadingSlash)
  } catch {
    return withoutLeadingSlash
  }
}

function isInsideDir(parentDir: string, childPath: string): boolean {
  const rel = relative(parentDir, childPath)
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.includes(':'))
}

/**
 * Vite plugin that:
 *  1. Exposes a `virtual:custom-fonts` module — a Record<name, relativePath> of
 *     every font file found in fontsDirs at build time.
 *  2. In dev mode, serves all fontsDirs at `/assets/fonts/` (later dirs win).
 *
 * Accepts a single directory or an array. Pass CUSTOM_FONTS_DIR from env as
 * an additional dir to support user-owned fonts outside the repo:
 *   customFontsPlugin([builtInDir, process.env.CUSTOM_FONTS_DIR].filter(Boolean))
 */
export function customFontsPlugin(fontsDirs: string | string[], options: CustomFontsOptions = {}): Plugin[] {
  const dirs = (Array.isArray(fontsDirs) ? fontsDirs : [fontsDirs]).filter(Boolean)
  const publicPath = options.publicPath ?? './assets/fonts'

  return [
    {
      name: 'custom-fonts-module',
      resolveId(id) {
        if (id === VIRTUAL_ID) return RESOLVED_ID
      },
      load(id) {
        if (id !== RESOLVED_ID) return
        return `export default ${JSON.stringify(collectFonts(dirs, publicPath))}`
      },
    },
    {
      name: 'custom-fonts-dev-server',
      configureServer(server) {
        server.middlewares.use(FONT_PUBLIC_PREFIX, (req, res, next) => {
          const fontFile = normalizeFontRequestUrl((req as any).url as string | undefined)
          if (!fontFile) return next()
          // Check each dir in order; last match wins
          let served = false
          for (const dir of [...dirs].reverse()) {
            const rootDir = resolve(dir)
            const fp = resolve(dir, fontFile)
            if (isInsideDir(rootDir, fp) && existsSync(fp)) {
              const ext = extname(fontFile).toLowerCase().slice(1)
              res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
              res.end(readFileSync(fp))
              served = true
              break
            }
          }
          if (!served) next()
        })
      },
    },
  ]
}

export function copyFontsPlugin(fontsDirs: string | string[], outputDir: string): Plugin {
  const dirs = (Array.isArray(fontsDirs) ? fontsDirs : [fontsDirs]).filter(Boolean)

  return {
    name: 'copy-fonts',
    closeBundle() {
      const destDir = resolve(outputDir, 'assets/fonts')
      mkdirSync(destDir, { recursive: true })
      for (const srcDir of dirs) {
        if (!existsSync(srcDir)) continue
        for (const file of readdirSync(srcDir)) {
          const srcPath = resolve(srcDir, file)
          if (statSync(srcPath).isFile()) {
            copyFileSync(srcPath, resolve(destDir, file))
          }
        }
      }

      for (const file of readdirSync(outputDir)) {
        if (FONT_EXTS.some(ext => file.toLowerCase().endsWith(ext))) {
          try { unlinkSync(resolve(outputDir, file)) } catch {}
        }
      }
    },
  }
}
