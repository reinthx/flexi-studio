import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { customFontsPlugin } from '../build/customFontsPlugin'

function copyFonts() {
  return {
    name: 'copy-fonts',
    closeBundle() {
      const srcDir = resolve(__dirname, '../fonts')
      const destDir = resolve(__dirname, '../dist/editor/assets/fonts')
      if (!existsSync(srcDir)) return
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      for (const file of readdirSync(srcDir)) {
        const srcPath = resolve(srcDir, file)
        if (statSync(srcPath).isFile()) {
          copyFileSync(srcPath, resolve(destDir, file))
        }
      }
      // Also remove fonts from root to avoid duplication
      const rootDir = resolve(__dirname, '../dist/editor')
      for (const file of readdirSync(rootDir)) {
        if (file.endsWith('.ttf')) {
          try { unlinkSync(resolve(rootDir, file)) } catch {}
        }
      }
    },
  }
}

const fontsDir = resolve(__dirname, '../fonts')

export default defineConfig({
  base: './',

  plugins: [vue(), copyFonts(), ...customFontsPlugin(fontsDir)],

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