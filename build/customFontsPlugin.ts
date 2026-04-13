import { resolve, extname, basename } from 'path'
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:custom-fonts'
const RESOLVED_ID = '\0virtual:custom-fonts'

const FONT_EXTS = ['.ttf', '.woff', '.woff2', '.otf']

const MIME: Record<string, string> = {
  ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2', otf: 'font/otf',
}

/**
 * Collect font files from one or more directories.
 * Later dirs win on name collision (user dir overrides built-in dir).
 */
function collectFonts(fontsDirs: string[]): Record<string, string> {
  const fonts: Record<string, string> = {}
  for (const dir of fontsDirs) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      const fp = resolve(dir, file)
      if (!statSync(fp).isFile()) continue
      const ext = extname(file).toLowerCase()
      if (!FONT_EXTS.includes(ext)) continue
      const name = basename(file, ext)
      fonts[name] = `./assets/fonts/${file}`
    }
  }
  return fonts
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
export function customFontsPlugin(fontsDirs: string | string[]): Plugin[] {
  const dirs = (Array.isArray(fontsDirs) ? fontsDirs : [fontsDirs]).filter(Boolean)

  return [
    {
      name: 'custom-fonts-module',
      resolveId(id) {
        if (id === VIRTUAL_ID) return RESOLVED_ID
      },
      load(id) {
        if (id !== RESOLVED_ID) return
        return `export default ${JSON.stringify(collectFonts(dirs))}`
      },
    },
    {
      name: 'custom-fonts-dev-server',
      configureServer(server) {
        server.middlewares.use('/assets/fonts', (req, res, next) => {
          const fontFile = ((req as any).url as string ?? '').replace(/^\//, '')
          if (!fontFile) return next()
          // Check each dir in order; last match wins
          let served = false
          for (const dir of [...dirs].reverse()) {
            const fp = resolve(dir, fontFile)
            if (existsSync(fp)) {
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
