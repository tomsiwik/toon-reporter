import { describe, expect, it } from 'vitest'

describe('slow tests', () => {
  it('should be fast', () => {
    expect(1 + 1).toBe(2)
  })

  it('should be slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(2 + 2).toBe(4)
  })

  it('should also be fast', () => {
    expect(3 + 3).toBe(6)
  })
})
