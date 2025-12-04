import { describe, expect, test } from 'vitest'

describe('Math operations', () => {
  test('addition works', () => {
    expect(2 + 2).toBe(4)
  })

  test('subtraction works', () => {
    expect(5 - 3).toBe(2)
  })

  describe('Nested suite', () => {
    test('multiplication works', () => {
      expect(3 * 4).toBe(12)
    })
  })
})

describe('String operations', () => {
  test('concatenation works', () => {
    expect('hello' + ' ' + 'world').toBe('hello world')
  })
})
