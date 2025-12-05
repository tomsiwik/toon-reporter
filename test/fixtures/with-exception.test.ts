import { expect, test } from 'vitest'

test('normal test passes', () => {
  expect(2 + 2).toBe(4)
})

test('throws TypeError', () => {
  const obj: any = null
  obj.foo.bar
})

test('throws custom error', () => {
  throw new Error('Something went wrong!')
})

test('throws ReferenceError', () => {
  // @ts-expect-error intentional undefined variable
  nonExistent.doSomething()
})
