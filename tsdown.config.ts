import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/playwright.ts'],
  exports: true,
})
