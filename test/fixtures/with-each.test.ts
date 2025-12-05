import { expect, test } from 'vitest'

test.each([
  [1, 1, 2],
  [2, 2, 4],
  [3, 3, 6],
])('add(%i, %i) = %i', (a, b, expected) => {
  expect(a + b).toBe(expected)
})

test.each([
  [2, 1, 1],
  [4, 2, 2],
  [6, 3, 4], // wrong: 6/3 = 2, not 4
])('divide(%i, %i) = %i', (a, b, expected) => {
  expect(a / b).toBe(expected)
})

test.each([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
])('$name is $age years old', ({ name, age }) => {
  expect(name.length).toBeGreaterThan(0)
  expect(age).toBeGreaterThan(0)
})
