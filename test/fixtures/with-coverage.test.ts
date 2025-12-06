import { describe, expect, it } from 'vitest'
import { add, subtract, divide } from './coverage-src/math'
import { identity, isEven } from './coverage-src/utils'

describe('math', () => {
  it('adds numbers', () => {
    expect(add(2, 3)).toBe(5)
  })

  it('subtracts numbers', () => {
    expect(subtract(5, 3)).toBe(2)
  })

  it('divides numbers', () => {
    expect(divide(10, 2)).toBe(5)
  })

  it('throws on division by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero')
  })
})

describe('utils - fully covered', () => {
  it('identity returns input', () => {
    expect(identity(42)).toBe(42)
    expect(identity('hello')).toBe('hello')
  })

  it('isEven checks parity', () => {
    expect(isEven(2)).toBe(true)
    expect(isEven(3)).toBe(false)
  })
})
