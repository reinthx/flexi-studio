import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { copyFileSync, existsSync, readFileSync } from 'fs'
import { copyFontsPlugin, customFontsPlugin } from '../build/customFontsPlugin'

const BUILD_REPO = 'https://github.com/reinthx/flexi-studio'

function resolveBuildInfo() {
  let version = 'dev'
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'))
    if (pkg?.version) version = String(pkg.version)
  } catch { /* ignore */ }
  const envSha = process.env.GITHUB_SHA ?? ''
  let sha = envSha.match(/^[0-9a-f]{40}$/i) ? envSha : ''
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch { sha = '' }
  }
  if (!/^[0-9a-f]{40}$/i.test(sha)) sha = 'dev'
  return {
    version,
    sha,
    shortSha: sha === 'dev' ? 'dev' : sha.slice(0, 7),
    time: new Date().toISOString(),
    repo: BUILD_REPO,
  }
}

const builtInFontsDir = resolve(__dirname, '../fonts')
// Set CUSTOM_FONTS_DIR in .env.local to include your own licensed fonts at build time
const userFontsDir = process.env.CUSTOM_FONTS_DIR ?? ''
const fontsDirs = [builtInFontsDir, userFontsDir].filter(Boolean)

export default defineConfig(({ mode }) => {
  const isLite = mode === 'lite'
  const outputDir = resolve(__dirname, isLite ? '../dist/overlay-lite' : '../dist/overlay')
  const liteIndexPlugin = {
    name: 'flexi-lite-index',
    closeBundle() {
      if (!isLite) return
      const liteHtml = resolve(outputDir, 'lite.html')
      if (existsSync(liteHtml)) copyFileSync(liteHtml, resolve(outputDir, 'index.html'))
    },
  }

  return {
  base: './',
  plugins: [vue(), copyFontsPlugin(fontsDirs, outputDir), ...customFontsPlugin(fontsDirs), liteIndexPlugin],
  publicDir: false,
  define: {
    __FLEXI_LITE__: JSON.stringify(isLite),
    __FLEXI_BUILD__: JSON.stringify(resolveBuildInfo()),
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
      '@': resolve(__dirname, 'src'),
    },
    dedupe: ['vue'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    target: 'es2015',
    chunkSizeWarningLimit: 700,
    modulePreload: false,
    assetsDir: 'assets',
    rollupOptions: {
      input: resolve(__dirname, isLite ? 'lite.html' : 'index.html'),
    },
  },
  }
})
