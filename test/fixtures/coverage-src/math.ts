export function add(a: number, b: number): number {
  return a + b
}

export function subtract(a: number, b: number): number {
  return a - b
}

// This function won't be tested - should show as uncovered
export function multiply(a: number, b: number): number {
  return a * b
}

// This function is fully covered
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero')
  }
  return a / b
}
