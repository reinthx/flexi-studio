import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFontsPlugin, customFontsPlugin } from '../build/customFontsPlugin'

const builtInFontsDir = resolve(__dirname, '../fonts')
// Set CUSTOM_FONTS_DIR in .env.local to include your own licensed fonts at build time
const userFontsDir = process.env.CUSTOM_FONTS_DIR ?? ''
const fontsDirs = [builtInFontsDir, userFontsDir].filter(Boolean)

export default defineConfig(() => {
  const outputDir = resolve(__dirname, '../dist/overlay')

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
      input: resolve(__dirname, 'index.html'),
    },
  },
  }
})
