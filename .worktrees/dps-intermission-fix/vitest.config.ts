import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared/src'),
    },
  },
  test: {
    include: ['shared/src/**/*.test.ts', 'overlay/src/**/*.test.ts', 'editor/src/**/*.test.ts'],
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
