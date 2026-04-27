import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFontsPlugin, customFontsPlugin } from '../build/customFontsPlugin'

const builtInFontsDir = resolve(__dirname, '../fonts')
// Set CUSTOM_FONTS_DIR in .env.local to include your own licensed fonts at build time
const userFontsDir = process.env.CUSTOM_FONTS_DIR ?? ''
const fontsDirs = [builtInFontsDir, userFontsDir].filter(Boolean)

export default defineConfig(({ mode }) => {
  const outputDir = resolve(__dirname, '../dist/editor')

  return {
  base: './',

  plugins: [vue(), copyFontsPlugin(fontsDirs, outputDir), ...customFontsPlugin(fontsDirs)],

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
    outDir: outputDir,
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
  }
})
