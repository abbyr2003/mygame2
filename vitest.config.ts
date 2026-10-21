import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: { '@renderer': resolve('src/renderer/src'), '@shared': resolve('src/shared') }
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
})
