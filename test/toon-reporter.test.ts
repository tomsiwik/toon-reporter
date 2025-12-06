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
})
