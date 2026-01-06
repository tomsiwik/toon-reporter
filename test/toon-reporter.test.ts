import { describe, expect, it } from 'vitest'
import { resolve } from 'pathe'
import { runVitest } from './test-utils'
import { ToonReporter } from '../src/toon-reporter'

const fixturesDir = resolve(__dirname, 'fixtures')

describe('ToonReporter', () => {
  describe('passing tests', () => {
    it('should output passing count when all tests pass', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['all-passing.test.ts'],
      })

      expect(stdout.trim()).toBe('passing: 2')
    })

    it('should output passing count for multiple test files', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['all-passing.test.ts', 'with-suites.test.ts'],
      })

      expect(stdout.trim()).toBe('passing: 6')
    })
  })

  describe('failing tests', () => {
    it('should output failures with location and expected/got', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['some-failing.test.ts'],
      })

      expect(stdout).toContain('passing: 1')
      // TOON uses tabular format for uniform failures
      expect(stdout).toContain('failing[1]{at,expected,got}:')
      expect(stdout).toContain('some-failing.test.ts:8:17')
      expect(stdout).toContain('"7"')
      expect(stdout).toContain('"6"')
    })

    it('should include relative file path with line and column', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['some-failing.test.ts'],
      })

      // Should be relative path with line:column
      expect(stdout).toMatch(/some-failing\.test\.ts:\d+:\d+/)
    })
  })

  describe('skipped tests', () => {
    it('should list skipped tests in tabular format', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['with-skipped.test.ts'],
      })

      expect(stdout).toContain('passing: 1')
      // TOON tabular format: skipped[N]{at,name}:
      expect(stdout).toContain('skipped[1]{at,name}:')
      expect(stdout).toContain('3 + 3 = 6')
    })

    it('should list todo tests in tabular format', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['with-skipped.test.ts'],
      })

      // TOON tabular format: todo[N]{at,name}:
      expect(stdout).toContain('todo[1]{at,name}:')
      expect(stdout).toContain('implement this later')
    })
  })

  describe('output format', () => {
    it('should use TOON dash list for non-uniform failures', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['some-failing.test.ts', 'with-exception.test.ts'],
      })

      // TOON dash list format for non-uniform objects (mixed expected/got and error)
      expect(stdout).toContain('- at:')
      expect(stdout).toContain('expected:')
      expect(stdout).toContain('error:')
    })

    it('should use TOON tabular format for uniform failures', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['some-failing.test.ts'],
      })

      // TOON tabular format for uniform objects
      expect(stdout).toContain('failing[1]{at,expected,got}:')
    })
  })

  describe('multiple projects', () => {
    it('should group results by project name', async () => {
      const projectsDir = resolve(fixturesDir, 'projects')
      const { stdout } = await runVitest({
        root: projectsDir,
        reporters: [new ToonReporter({ color: false })],
        projects: [
          {
            test: {
              name: 'server',
              root: resolve(projectsDir, 'server'),
              include: ['**/*.test.ts'],
            },
          },
          {
            test: {
              name: 'client',
              root: resolve(projectsDir, 'client'),
              include: ['**/*.test.ts'],
            },
          },
        ],
      })

      // Should group by project
      expect(stdout).toContain('server:')
      expect(stdout).toContain('client:')
      // Server has 1 pass, 1 fail
      expect(stdout).toMatch(/server:[\s\S]*passing: 1/)
      expect(stdout).toMatch(/server:[\s\S]*failing/)
      // Client has 2 passes
      expect(stdout).toMatch(/client:[\s\S]*passing: 2/)
    })
  })

  describe('coverage', () => {
    it('should hide fully covered files and only show metrics that need improvement', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false, verbose: false })],
        include: ['with-coverage.test.ts'],
        coverage: {
          enabled: true,
          provider: 'v8',
          include: ['coverage-src/**'],
        },
      })

      expect(stdout).toContain('passing: 6')
      expect(stdout).toContain('coverage:')
      expect(stdout).toContain('"total%":')
      // math.ts has uncovered lines (multiply function)
      expect(stdout).toContain('math.ts')
      // utils.ts is 100% covered - should NOT appear
      expect(stdout).not.toContain('utils.ts')
    })

    it('should show all files in verbose mode', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false, verbose: true })],
        include: ['with-coverage.test.ts'],
        coverage: {
          enabled: true,
          provider: 'v8',
          include: ['coverage-src/**'],
        },
      })

      expect(stdout).toContain('passing: 6')
      expect(stdout).toContain('coverage:')
      // Both files should appear in verbose mode
      expect(stdout).toContain('math.ts')
      expect(stdout).toContain('utils.ts')
      // Should have percentage columns
      expect(stdout).toContain('"lines%"')
      expect(stdout).toContain('"stmts%"')
      expect(stdout).toContain('"branch%"')
      expect(stdout).toContain('"funcs%"')
    })
  })

  describe('edge cases', () => {
    it('should show error when no test files found', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['nonexistent-file-pattern-*.test.ts'],
      })

      // Should show error without passing count
      expect(stdout).not.toContain('passing:')
      expect(stdout).toContain('error:')
      expect(stdout).toContain('No test files found')
    })

    it('should add (filtered) suffix when testNamePattern is used', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['all-passing.test.ts'],
        testNamePattern: /nonexistent-test-pattern/,
      })

      // Should add (filtered) suffix to passing line
      expect(stdout).toContain('passing: 0 (filtered)')
      expect(stdout).toContain('skipped: 2')
    })
  })

  describe('timing option', () => {
    it('should show per-test timing with line numbers when includeTaskLocation is enabled', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false, timing: true })],
        include: ['with-slow-test.test.ts'],
        includeTaskLocation: true,
      })

      // Should include total duration with unit
      expect(stdout).toMatch(/duration: \d+ms/)
      // Should use tabular format with timing data
      expect(stdout).toContain('passing[3]{at,name,ms}:')
      // Should include line:column in at field
      expect(stdout).toMatch(/"with-slow-test\.test\.ts:\d+:\d+"/)
      expect(stdout).toContain('should be fast')
      expect(stdout).toContain('should be slow')
      expect(stdout).toContain('should also be fast')
    })

    it('should show timing without line numbers when includeTaskLocation is not enabled', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false, timing: true })],
        include: ['with-slow-test.test.ts'],
        // NO includeTaskLocation
      })

      // Should still show timing data
      expect(stdout).toMatch(/duration: \d+ms/)
      expect(stdout).toContain('passing[3]{at,name,ms}:')
      // But without line:column (just filename)
      expect(stdout).toContain('with-slow-test.test.ts,should be fast')
      expect(stdout).not.toMatch(/"with-slow-test\.test\.ts:\d+:\d+"/)
    })

    it('should show count only when timing option is not set', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['with-slow-test.test.ts'],
      })

      // Should show simple count without timing
      expect(stdout).toContain('passing: 3')
      expect(stdout).not.toContain('passing[')
      expect(stdout).not.toContain('{at,name,ms}')
    })
  })
})
