import { describe, expect, it } from 'vitest'
import { runPlaywright } from './playwright-test-utils'

// Strip ANSI color codes for easier assertions
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

describe('ToonPlaywrightReporter', () => {
  describe('passing tests', () => {
    it('should output passing count when all tests pass', async () => {
      const { stdout } = await runPlaywright(['example.spec.ts'])
      const output = stripAnsi(stdout)

      expect(output).toContain('passing: 3')
      expect(output).not.toContain('failing')
      expect(output).not.toContain('skipped')
      expect(output).not.toContain('todo')
    }, 30000)
  })

  describe('failing tests', () => {
    it('should output failures with location (line:column) and expected/got', async () => {
      const { stdout } = await runPlaywright(['failing.spec.ts'])
      const output = stripAnsi(stdout)

      expect(output).toContain('passing: 1')
      expect(output).toContain('failing[1]{at,expected,got}:')
      // Should always include line:column for Playwright
      expect(output).toMatch(/test\/playwright-fixtures\/failing\.spec\.ts:\d+:\d+/)
      expect(output).toContain('Wrong Title')
      expect(output).toContain('Hello World')
    }, 30000)
  })

  describe('skipped and todo tests', () => {
    it('should list skipped tests with line:column in tabular format', async () => {
      const { stdout } = await runPlaywright(['skipped.spec.ts'])
      const output = stripAnsi(stdout)

      expect(output).toContain('passing: 1')
      expect(output).toContain('skipped[1]{at,name}:')
      // Should always include line:column for Playwright
      expect(output).toMatch(/skipped\.spec\.ts:\d+:\d+/)
      expect(output).toContain('should be skipped')
    }, 30000)

    it('should list fixme tests as todo with line:column', async () => {
      const { stdout } = await runPlaywright(['skipped.spec.ts'])
      const output = stripAnsi(stdout)

      expect(output).toContain('todo[1]{at,name}:')
      // Should always include line:column for Playwright
      expect(output).toMatch(/skipped\.spec\.ts:\d+:\d+/)
      expect(output).toContain('should be marked as todo')
    }, 30000)
  })

  describe('flaky tests', () => {
    it('should detect flaky tests with line:column (passed after retry)', async () => {
      const { stdout } = await runPlaywright({
        testFiles: ['flaky.spec.ts'],
        config: 'playwright-flaky.config.ts',
      })
      const output = stripAnsi(stdout)

      // The flaky test should pass eventually but be marked as flaky
      expect(output).toContain('flaky[1]{at,name,retries}:')
      // Should always include line:column for Playwright
      expect(output).toMatch(/flaky\.spec\.ts:\d+:\d+/)
      expect(output).toContain('should be flaky')
    }, 60000)
  })
})
