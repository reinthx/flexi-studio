import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared/src'),
      '@overlay': resolve(__dirname, 'overlay/src'),
      // Vue lives in the workspace packages (not hoisted to the root), so
      // component tests pin a single instance for SFCs + test-utils.
      'vue': resolve(__dirname, 'editor/node_modules/vue'),
      // Build-time plugin module (custom fonts); tests use an empty map.
      'virtual:custom-fonts': resolve(__dirname, 'shared/src/__tests__/virtualCustomFontsStub.ts'),
    },
  },
  test: {
    include: ['shared/src/**/*.test.ts', 'overlay/src/**/*.test.ts', 'editor/src/**/*.test.ts'],
    // Node by default; DOM component tests opt in per file via
    // `/** @vitest-environment jsdom */`.
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['shared/src/**/*.{ts,vue}', 'overlay/src/**/*.{ts,vue}', 'editor/src/**/*.{ts,vue}'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.d.ts',
        '**/vendor/**',
        '**/main.ts',
        '**/App.vue',
        '**/index.ts',
        'editor/src/lib/cssBuilder.ts',
        'editor/src/lib/formatValue.ts',
        'editor/src/lib/templateRenderer.ts',
        'overlay/src/lib/cssBuilder.ts',
        'overlay/src/lib/formatValue.ts',
        'overlay/src/lib/templateRenderer.ts',
      ],
    },
  },
})
