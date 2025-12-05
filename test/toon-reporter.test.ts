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
      expect(stdout).toContain('failing[1]:')
      expect(stdout).toContain('at: some-failing.test.ts:8:17')
      expect(stdout).toContain('expected: "7"')
      expect(stdout).toContain('got: "6"')
    })

    it('should include relative file path with line and column', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['some-failing.test.ts'],
      })

      // Should be relative path (without ./ prefix)
      expect(stdout).toMatch(/at: [\w-]+\.test\.ts:\d+:\d+/)
    })
  })

  describe('skipped tests', () => {
    it('should list skipped tests separately', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['with-skipped.test.ts'],
      })

      expect(stdout).toContain('passing: 1')
      expect(stdout).toContain('skipped[1]:')
      expect(stdout).toContain('name: 3 + 3 = 6')
    })

    it('should list todo tests separately', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['with-skipped.test.ts'],
      })

      expect(stdout).toContain('todo[1]:')
      expect(stdout).toContain('name: implement this later')
    })
  })

  describe('output format', () => {
    it('should use YAML-style list format for failures', async () => {
      const { stdout } = await runVitest({
        root: fixturesDir,
        reporters: [new ToonReporter({ color: false })],
        include: ['some-failing.test.ts'],
      })

      // Should have YAML-style indented format
      expect(stdout).toContain('  - at:')
      expect(stdout).toContain('    expected:')
      expect(stdout).toContain('    got:')
    })
  })
})
