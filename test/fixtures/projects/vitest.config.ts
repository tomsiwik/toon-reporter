import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          root: './server',
          include: ['**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          root: './client',
          include: ['**/*.test.ts'],
        },
      },
    ],
  },
})
