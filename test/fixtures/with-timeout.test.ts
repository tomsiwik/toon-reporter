import { expect, test } from 'vitest'

test('fast test passes', () => {
  expect(1 + 1).toBe(2)
})

test('slow test times out', { timeout: 100 }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  expect(true).toBe(true)
})
