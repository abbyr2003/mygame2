import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@renderer': resolve('src/renderer/src'), '@shared': resolve('src/shared') }
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
})
