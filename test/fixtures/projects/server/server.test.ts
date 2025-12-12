import { describe, expect, it } from 'vitest'

describe('server', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2)
  })

  it('should fail', () => {
    expect(1 + 1).toBe(3)
  })
})
