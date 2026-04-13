import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { customFontsPlugin } from '../build/customFontsPlugin'

function copyFonts(fontsDirs: string[]) {
  return {
    name: 'copy-fonts',
    closeBundle() {
      const destDir = resolve(__dirname, '../dist/editor/assets/fonts')
      mkdirSync(destDir, { recursive: true })
      for (const srcDir of fontsDirs) {
        if (!existsSync(srcDir)) continue
        for (const file of readdirSync(srcDir)) {
          const srcPath = resolve(srcDir, file)
          if (statSync(srcPath).isFile()) {
            copyFileSync(srcPath, resolve(destDir, file))
          }
        }
      }
      // Remove any fonts accidentally emitted to root
      const rootDir = resolve(__dirname, '../dist/editor')
      for (const file of readdirSync(rootDir)) {
        if (['.ttf', '.otf', '.woff', '.woff2'].some(e => file.endsWith(e))) {
          try { unlinkSync(resolve(rootDir, file)) } catch {}
        }
      }
    },
  }
}

const builtInFontsDir = resolve(__dirname, '../fonts')
// Set CUSTOM_FONTS_DIR in .env.local to include your own licensed fonts at build time
const userFontsDir = process.env.CUSTOM_FONTS_DIR ?? ''
const fontsDirs = [builtInFontsDir, userFontsDir].filter(Boolean)

export default defineConfig({
  base: './',

  plugins: [vue(), copyFonts(fontsDirs), ...customFontsPlugin(fontsDirs)],

  publicDir: false,

  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
      '@': resolve(__dirname, 'src'),
    },
    dedupe: ['vue'],
  },

  server: {
    fs: {
      allow: ['..'],
    },
    host: '0.0.0.0',
    port: 5173,
  },

  build: {
    outDir: '../dist/editor',
    emptyOutDir: true,
    assetsDir: 'assets',

    commonjsOptions: {
      include: [/shared/, /node_modules/],
    },

    rollupOptions: {
      output: {
        manualChunks: {
          'base64-assets': [
            resolve(__dirname, '../shared/src/jobIcons.ts'),
            resolve(__dirname, '../shared/src/texturePresets.ts'),
          ],
        },
      },
    },
  },
})