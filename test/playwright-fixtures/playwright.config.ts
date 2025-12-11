import { defineConfig } from '@playwright/test'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [[resolve(__dirname, '../../dist/playwright.mjs')]],
  use: {
    baseURL: 'http://localhost:3456',
    trace: 'off',
  },
  webServer: {
    command: 'npx serve -l 3456',
    port: 3456,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
