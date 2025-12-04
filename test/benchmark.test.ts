import { describe, expect, it } from 'vitest'
import { encode } from 'gpt-tokenizer'
import { encode as toonEncode, decode as toonDecode } from '@toon-format/toon'

function countTokens(text: string): number {
  return encode(text).length
}

// Simulate realistic test failure data with stack traces
const sampleTestResults = {
  success: false,
  summary: {
    total: 10,
    passed: 7,
    failed: 3,
    skipped: 0,
    pending: 0,
    todo: 0,
  },
  modules: [
    { file: 'src/utils/validator.test.ts', status: 'failed', duration: 245.5 },
    { file: 'src/api/handler.test.ts', status: 'failed', duration: 189.2 },
    { file: 'src/components/Button.test.ts', status: 'passed', duration: 56.3 },
  ],
  tests: [
    {
      name: 'validates email format',
      fullName: 'Validator > validates email format',
      status: 'passed',
      duration: 12.5,
      error: null,
    },
    {
      name: 'validates phone number',
      fullName: 'Validator > validates phone number',
      status: 'passed',
      duration: 8.3,
      error: null,
    },
    {
      name: 'rejects invalid email',
      fullName: 'Validator > rejects invalid email',
      status: 'failed',
      duration: 15.2,
      error: `AssertionError: expected 'invalid' to match /^[\\w.-]+@[\\w.-]+\\.\\w+$/

Expected: /^[\\w.-]+@[\\w.-]+\\.\\w+$/
Received: "invalid"

    at Object.<anonymous> (src/utils/validator.test.ts:24:18)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
    },
    {
      name: 'handles empty input',
      fullName: 'Validator > handles empty input',
      status: 'failed',
      duration: 22.1,
      error: `TypeError: Cannot read properties of undefined (reading 'trim')

    at Validator.validate (src/utils/validator.ts:15:22)
    at Object.<anonymous> (src/utils/validator.test.ts:31:24)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
    },
    {
      name: 'returns 200 for valid request',
      fullName: 'API Handler > returns 200 for valid request',
      status: 'passed',
      duration: 45.6,
      error: null,
    },
    {
      name: 'returns 400 for missing params',
      fullName: 'API Handler > returns 400 for missing params',
      status: 'passed',
      duration: 38.2,
      error: null,
    },
    {
      name: 'handles database errors',
      fullName: 'API Handler > handles database errors',
      status: 'failed',
      duration: 89.4,
      error: `AssertionError: expected 500 to equal 503

Expected: 503
Received: 500

Comparison:
  -503
  +500

    at Object.<anonymous> (src/api/handler.test.ts:67:31)
    at runTest (node_modules/vitest/dist/chunks/runtime-runTest.js:82:15)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
    },
    {
      name: 'renders correctly',
      fullName: 'Button > renders correctly',
      status: 'passed',
      duration: 23.1,
      error: null,
    },
    {
      name: 'handles click',
      fullName: 'Button > handles click',
      status: 'passed',
      duration: 18.7,
      error: null,
    },
    {
      name: 'shows loading state',
      fullName: 'Button > shows loading state',
      status: 'passed',
      duration: 15.4,
      error: null,
    },
  ],
}

describe('Token Efficiency Benchmark', () => {
  it('should compare TOON vs JSON token counts for test results with stack traces', () => {
    const jsonOutput = JSON.stringify(sampleTestResults, null, 2)
    const toonOutput = toonEncode(sampleTestResults)

    const jsonTokens = countTokens(jsonOutput)
    const toonTokens = countTokens(toonOutput)

    const savings = ((jsonTokens - toonTokens) / jsonTokens * 100).toFixed(1)

    console.log('\n=== Token Efficiency Benchmark ===')
    console.log(`JSON tokens: ${jsonTokens}`)
    console.log(`TOON tokens: ${toonTokens}`)
    console.log(`Token savings: ${savings}%`)
    console.log(`\nJSON size: ${jsonOutput.length} chars`)
    console.log(`TOON size: ${toonOutput.length} chars`)
    console.log(`\n--- TOON Output ---\n${toonOutput}`)

    // Verify TOON can be decoded back
    const decoded = toonDecode(toonOutput)
    expect(decoded).toEqual(sampleTestResults)

    // TOON should provide some savings
    expect(toonTokens).toBeLessThan(jsonTokens)
  })

  it('should show token efficiency for minimal error (current implementation)', () => {
    const minimalError = {
      success: false,
      summary: { total: 2, passed: 1, failed: 1, skipped: 0, pending: 0, todo: 0 },
      modules: [{ file: 'some-failing.test.ts', status: 'failed', duration: 3.4 }],
      tests: [
        { name: '1 + 1 = 2', fullName: '1 + 1 = 2', status: 'passed', duration: 0.66, error: null },
        { name: '3 + 3 = 7', fullName: '3 + 3 = 7', status: 'failed', duration: 3.4, error: 'expected 6 to be 7 // Object.is equality' },
      ],
    }

    const jsonOutput = JSON.stringify(minimalError, null, 2)
    const toonOutput = toonEncode(minimalError)

    const jsonTokens = countTokens(jsonOutput)
    const toonTokens = countTokens(toonOutput)

    console.log('\n=== Minimal Error Format ===')
    console.log(`JSON tokens: ${jsonTokens}`)
    console.log(`TOON tokens: ${toonTokens}`)
    console.log(`Savings: ${((jsonTokens - toonTokens) / jsonTokens * 100).toFixed(1)}%`)
    console.log(`\n--- TOON Output ---\n${toonOutput}`)
  })

  it('should compare different error verbosity levels', () => {
    const errorLevels = {
      minimal: 'expected 6 to be 7',
      withContext: 'expected 6 to be 7 // Object.is equality',
      withDiff: `expected 6 to be 7 // Object.is equality

Expected: 7
Received: 6`,
      withStack: `AssertionError: expected 6 to be 7 // Object.is equality

Expected: 7
Received: 6

    at Object.<anonymous> (some-failing.test.ts:8:16)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
    }

    console.log('\n=== Error Verbosity Comparison ===')
    for (const [level, error] of Object.entries(errorLevels)) {
      const tokens = countTokens(error)
      console.log(`${level}: ${tokens} tokens (${error.length} chars)`)
    }
  })
})
