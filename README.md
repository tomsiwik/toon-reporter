# toon-reporter

A minimal Vitest reporter optimized for LLM consumption. Outputs test results in a compact, token-efficient format.

## Installation

```bash
npm install toon-reporter
```

## Usage

### CLI

```bash
npx vitest run --reporter=toon-reporter
```

### Config

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: ['toon-reporter'],
  },
})
```

## Output Format

### All tests passing

```
passing: 42
```

### With failures

```
passing: 40
failing[2]:
- at: src/utils.test.ts:15:12
  expected: "7"
  got: "6"
- at: src/api.test.ts:42:8
  error: TypeError: Cannot read property 'id' of undefined
```

### With parameterized test failures

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
  src/api.test.ts,implement error handling
skipped[2]{at,name}:
  src/utils.test.ts,handles edge case
```

## Colors

- **Green**: `passing` count
- **Red**: `failing` header
- **Yellow**: file paths
- **Gray**: `skipped` tests
- **Cyan**: `todo` tests

Colors are automatically disabled when:
- `NO_COLOR` environment variable is set
- `CI` environment variable is set
- Output is written to a file

## Options

### `color`

Enable/disable colored output (default: `true`).

```ts
reporters: [['toon-reporter', { color: false }]]
```

### `outputFile`

Write report to a file instead of stdout.

```ts
reporters: [['toon-reporter', { outputFile: 'test-results.txt' }]]
```

## Skipped/Todo Line Numbers

To get line:column information for skipped and todo tests, enable `includeTaskLocation` in your vitest config:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    includeTaskLocation: true,
    reporters: ['toon-reporter'],
  },
})
```

Or via CLI:

```bash
npx vitest run --reporter=toon-reporter --includeTaskLocation
```

Without this option, skipped/todo tests will only show the file path (not line:column). This is a Vitest limitation - test locations are only collected when this config is enabled before test collection.

## Why?

Traditional test reporters output verbose information optimized for human readability. When feeding test results to an LLM for automated fixing, this verbosity wastes tokens. This reporter outputs only what's needed:

- Pass count
- Failure locations with expected/got values
- Skipped/todo test names for context

## Token Efficiency

Measured on a test suite with 25 tests (16 passing, 7 failing, 1 skipped, 1 todo):

| Reporter | Tokens | vs Default | vs JSON |
|----------|-------:|:----------:|:-------:|
| default  |  4,884 |     -      |   -10%  |
| json     |  5,418 |    +11%    |    -    |
| **toon** |  **212** | **-96%** | **-96%** |

TOON uses ~96% fewer tokens than standard reporters.
