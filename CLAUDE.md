# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

toon-reporter is a minimal Vitest reporter optimized for LLM consumption. It outputs test results in a compact, token-efficient format using the TOON specification, achieving ~96% fewer tokens than standard Vitest reporters.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build with tsdown
pnpm dev              # Build in watch mode
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm test <pattern>   # Run specific test file
```

## Architecture

### Core Components

- **src/toon-reporter.ts** - Main `ToonReporter` class implementing the Vitest Reporter interface. Handles test result collection, error parsing, and TOON format output generation.

- **src/reporter.ts** - TypeScript interface definitions for the Vitest Reporter API (lifecycle hooks like `onInit`, `onTestRunEnd`, `onTestCaseResult`, etc.).

- **src/reported-tasks.ts** - Type wrappers around Vitest's internal task types (`TestCase`, `TestSuite`, `TestModule`, `TestCollection`).

- **src/config-helpers.ts** - Utilities for resolving output file paths and serializing define configurations.

### Output Format

The reporter outputs in TOON format:
- `passing: N` - count of passed tests
- `failing[N]:` - list with `at:`, `expected:`, `got:` or `error:` fields
- `todo[N]{at,name}:` - tabular format for todo tests
- `skipped[N]{at,name}:` - tabular format for skipped tests

Parameterized test failures (`.each`) are grouped by location with `parameters[N]{expected,got}:` tabular format.

### Testing

Tests use `test/test-utils.ts` which provides `runVitest()` - a helper that runs Vitest programmatically with captured stdout/stderr. Test fixtures in `test/fixtures/` provide various test scenarios (passing, failing, skipped, timeouts, etc.).

The main test runs Vitest against these fixtures with `ToonReporter` and asserts on the output format.
