# toon-reporter

A minimal Vitest and Playwright reporter optimized for LLM consumption. Outputs test results in a compact, token-efficient format.

## Installation

```bash
npm install @epicat/toon-reporter
```

## Usage

### Vitest

#### CLI

```bash
npx vitest run --reporter=@epicat/toon-reporter
```

#### Config

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['@epicat/toon-reporter'],
  },
})
```

### Playwright

#### Config

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [['@epicat/toon-reporter/playwright']],
})
```

#### With options

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [
    ['@epicat/toon-reporter/playwright', {
      outputFile: 'test-results.toon'
    }]
  ],
})
```

## Output Format

### All tests passing

```
passing: 42
```

### With failures (Vitest)

```
passing: 40
failing[2]:
  - at: src/utils.test.ts:15:12
    expected: "7"
    got: "6"
  - at: src/api.test.ts:42:8
    error: TypeError: Cannot read property 'id' of undefined
```

### With failures (Playwright)

```
passing: 1
failing[1]{at,expected,got}:
  "login.spec.ts:7:42",Welcome,Hello World
```

### With parameterized test failures (Vitest)

Uses TOON tabular format for uniform parameter arrays:

```
passing: 6
failing[2]:
  - at: math.test.ts:16:17
    parameters[2]{expected,got}:
      "1","2"
      "4","2"
```

### With todo/skipped tests

Uses TOON tabular format for uniform arrays:

```
passing: 38
todo[1]{at,name}:
  "src/api.test.ts:15:3",implement error handling
skipped[2]{at,name}:
  "src/utils.test.ts:8:3",handles edge case
```

### With test name filtering

When using `--testNamePattern` or `-t`, results show a `(filtered)` indicator:

```
passing: 5 (filtered)
skipped: 42
```

### With timing enabled

When `timing: true` is set, shows total duration and per-test timing:

```
duration: 52ms
passing[3]{at,name,ms}:
  utils.test.ts,should be fast,1
  api.test.ts,should handle requests,50
  db.test.ts,should be slow,1
```

### With flaky tests (Playwright)

Tests that fail initially but pass on retry are reported as flaky:

```
passing: 5
flaky[1]{at,name,retries}:
  "checkout.spec.ts:12:3",should complete payment,2
```

### With coverage (Vitest only)

Coverage is automatically included when running with `--coverage`. No extra configuration needed:

```bash
npx vitest run --coverage --reporter=@epicat/toon-reporter
```

Output includes total percentages and uncovered lines per file:

```
passing: 8
coverage:
  "total%":
    lines: 60.99
    stmts: 58.82
    branch: 44.34
    funcs: 57.57
  files[1]{file,uncoveredLines}:
    src/toon-reporter.ts,"12-14,19-23,32,99"
```

- **Total percentages**: Help teams track coverage thresholds
- **Per-file uncovered lines**: Give LLMs actionable info to improve coverage
- **100% covered files are hidden** by default to reduce noise

With `verbose: true`, all files appear with per-file percentages:

```
  files[2]{file,uncoveredLines,"lines%","stmts%","branch%","funcs%"}:
    src/toon-reporter.ts,"12-14,19-23,32,99",56.89,55.63,43.63,61.53
    test/test-utils.ts,"",100,100,100,100
```

## Colors

- **Green**: `passing` count
- **Red**: `failing` header
- **Yellow**: `flaky` header, `skipped` count, file paths
- **Gray**: `skipped` tests (detailed list)
- **Cyan**: `todo` tests
- **Purple**: `(filtered)` indicator when using `testNamePattern`

Colors are enabled when:
- `COLOR` environment variable is set, OR
- `color: true` option is passed

Colors are always disabled when:
- `CI` environment variable is set (hard disable)
- Output is written to a file

## Options

### `color`

Enable/disable colored output.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { ToonReporter } from '@epicat/toon-reporter'

export default defineConfig({
  test: {
    reporters: [new ToonReporter({ color: true })],
  },
})
```

Or via environment variable:

```bash
COLOR=1 npx vitest run --reporter=@epicat/toon-reporter
```

### `outputFile`

Write report to a file instead of stdout.

```ts
reporters: [['@epicat/toon-reporter', { outputFile: 'test-results.txt' }]]
```

### `verbose`

Include per-file coverage percentages (lines, stmts, branch, funcs) alongside uncovered lines.

```ts
reporters: [new ToonReporter({ verbose: true })]
```

### `timing`

Show per-test timing information and total duration. Useful for identifying slow tests.

```ts
reporters: [new ToonReporter({ timing: true })]
```

Output:

```
duration: 1m30s52ms
passing[3]{at,name,ms}:
  utils.test.ts,should be fast,1
  api.test.ts,should handle requests,50
  db.test.ts,should query slowly,90000
```

## Skipped/Todo Line Numbers

### Vitest

To get line:column information for skipped and todo tests, enable `includeTaskLocation` in your vitest config:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    includeTaskLocation: true,
    reporters: ['@epicat/toon-reporter'],
  },
})
```

Or via CLI:

```bash
npx vitest run --reporter=@epicat/toon-reporter --includeTaskLocation
```

Without this option, skipped/todo tests will only show the file path (not line:column). This is a Vitest limitation - test locations are only collected when this config is enabled before test collection.

### Playwright

Playwright always includes test locations. Tests marked with `test.fixme()` are reported as `todo`, while `test.skip()` tests are reported as `skipped`.

## Playwright-Specific Features

### Flaky Test Detection

When `retries` is configured in your Playwright config, tests that fail initially but pass on retry are reported as flaky:

```ts
// playwright.config.ts
export default defineConfig({
  retries: 2,
  reporter: [['@epicat/toon-reporter/playwright']],
})
```

Output: `flaky[1]{at,name,retries}: "test.spec.ts:5:3",should work,1`

## Why?

Traditional test reporters output verbose information optimized for human readability. When feeding test results to an LLM for automated fixing, this verbosity wastes tokens. This reporter outputs only what's needed:

- Pass count
- Failure locations with expected/got values
- Flaky test detection with retry counts (Playwright)
- Skipped/todo test names for context
- Coverage totals and uncovered lines (Vitest with `--coverage`)

## Token Efficiency

Measured on a test suite with 25 tests (16 passing, 7 failing, 1 skipped, 1 todo):

| Reporter | Tokens | vs Default | vs JSON |
|----------|-------:|:----------:|:-------:|
| default  |  4,884 |     -      |   -10%  |
| json     |  5,418 |    +11%    |    -    |
| **toon** |  **212** | **-96%** | **-96%** |

TOON uses ~96% fewer tokens than standard reporters.
