import { defineConfig } from 'vitest/config'
import ToonReporter from '../../src'

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    reporters: [new ToonReporter({ color: false })]
  },
})
