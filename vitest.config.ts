import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/.agentslack/**',
      '**/dist/**',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'lib/**/*.ts',
        'server/**/*.ts',
        'app/api/**/*.ts',
        'middleware.ts',
      ],
      exclude: [
        'lib/generated/**',
        'lib/db/**',
        'lib/socket/**',
        'server/mcp-bridge.ts',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
