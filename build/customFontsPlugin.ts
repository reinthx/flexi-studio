import { resolve, extname, basename } from 'path'
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:custom-fonts'
const RESOLVED_ID = '\0virtual:custom-fonts'

/**
 * Vite plugin that:
 *  1. Exposes a `virtual:custom-fonts` module — a Record<name, relativePath> of
 *     every font file found in `fontsDir` at build time.
 *  2. In dev mode, serves `fontsDir` at `/assets/fonts/` so the paths work
 *     the same way they do in the production build.
 */
export function customFontsPlugin(fontsDir: string): Plugin[] {
  return [
    {
      name: 'custom-fonts-module',
      resolveId(id) {
        if (id === VIRTUAL_ID) return RESOLVED_ID
      },
      load(id) {
        if (id !== RESOLVED_ID) return
        const fonts: Record<string, string> = {}
        if (existsSync(fontsDir)) {
          for (const file of readdirSync(fontsDir)) {
            const fp = resolve(fontsDir, file)
            if (!statSync(fp).isFile()) continue
            const ext = extname(file).toLowerCase()
            if (!['.ttf', '.woff', '.woff2', '.otf'].includes(ext)) continue
            const name = basename(file, ext)
            fonts[name] = `./assets/fonts/${file}`
          }
        }
        return `export default ${JSON.stringify(fonts)}`
      },
    },
    {
      name: 'custom-fonts-dev-server',
      configureServer(server) {
        server.middlewares.use('/assets/fonts', (req, res, next) => {
          const fontFile = ((req as any).url as string ?? '').replace(/^\//, '')
          if (!fontFile) return next()
          const fp = resolve(fontsDir, fontFile)
          if (existsSync(fp)) {
            const ext = extname(fontFile).toLowerCase().slice(1)
            const mimes: Record<string, string> = {
              ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2', otf: 'font/otf',
            }
            res.setHeader('Content-Type', mimes[ext] ?? 'application/octet-stream')
            res.end(readFileSync(fp))
          } else {
            next()
          }
        })
      },
    },
  ]
}
