import { existsSync, promises as fs } from 'node:fs'
import { dirname, relative, resolve } from 'pathe'
import { encode } from '@toon-format/toon'
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
} from '@playwright/test/reporter'

export interface ToonPlaywrightReporterOptions {
  outputFile?: string
  /** @internal Used for testing to capture output */
  _captureOutput?: (output: string) => void
}

interface FailureData {
  at: string
  expected?: string
  got?: string
  error?: string
}

interface FlakyData {
  at: string
  name: string
  retries: number
}

interface SkippedData {
  at: string
  name: string
}

interface ReportData {
  passing: number
  flaky?: FlakyData[]
  failing?: FailureData[]
  todo?: SkippedData[]
  skipped?: SkippedData[]
}

export class ToonPlaywrightReporter implements Reporter {
  private config!: FullConfig
  private suite!: Suite
  private options: ToonPlaywrightReporterOptions

  constructor(options: ToonPlaywrightReporterOptions = {}) {
    this.options = options
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config
    this.suite = suite
  }

  private get rootDir(): string {
    return this.config.rootDir
  }

  private formatLocation(filePath: string, line?: number, column?: number): string {
    const relPath = relative(this.rootDir, filePath)
    return line ? `${relPath}:${line}:${column || 0}` : relPath
  }

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, '')
  }

  private stripOuterQuotes(str: string): string {
    // Remove surrounding quotes if present (e.g., "value" -> value)
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1)
    }
    return str
  }

  private parseExpectedGot(error: TestError): { expected?: string; got?: string } {
    const message = this.stripAnsi(error?.message || '')
    // Playwright expect format: "Expected: X\nReceived: Y"
    const expectedMatch = message.match(/Expected:\s*(.+?)(?:\n|$)/i)
    const receivedMatch = message.match(/Received:\s*(.+?)(?:\n|$)/i)
    if (expectedMatch && receivedMatch) {
      return {
        expected: this.stripOuterQuotes(expectedMatch[1].trim()),
        got: this.stripOuterQuotes(receivedMatch[1].trim()),
      }
    }
    // Alternative format: "expect(received).toBe(expected)"
    const toBeMatch = message.match(/expect\((.+?)\)\.toBe\((.+?)\)/i)
    if (toBeMatch) {
      return {
        expected: this.stripOuterQuotes(toBeMatch[2].trim()),
        got: this.stripOuterQuotes(toBeMatch[1].trim()),
      }
    }
    return {}
  }

  async onEnd(result: FullResult): Promise<void> {
    const allTests = this.suite.allTests()

    const passedTests: TestCase[] = []
    const failedTests: TestCase[] = []
    const skippedTests: TestCase[] = []
    const todoTests: TestCase[] = []
    const flakyTests: TestCase[] = []

    for (const test of allTests) {
      const lastResult = test.results[test.results.length - 1]
      if (!lastResult) continue

      const status = lastResult.status

      // Check for fixme annotation (Playwright's equivalent of todo)
      const isFixme = test.annotations.some((a) => a.type === 'fixme')

      // Check for flaky test (failed at least once but eventually passed)
      const isFlaky =
        status === 'passed' &&
        test.results.length > 1 &&
        test.results.some((r) => r.status === 'failed')

      if (isFlaky) {
        flakyTests.push(test)
      } else if (status === 'passed') {
        passedTests.push(test)
      } else if (status === 'failed' || status === 'timedOut' || status === 'interrupted') {
        failedTests.push(test)
      } else if (status === 'skipped') {
        if (isFixme) {
          todoTests.push(test)
        } else {
          skippedTests.push(test)
        }
      }
    }

    const failures: FailureData[] = []

    for (const test of failedTests) {
      const lastResult = test.results[test.results.length - 1]
      const error = lastResult?.errors?.[0]
      const loc = error?.location || test.location
      const at = this.formatLocation(loc.file, loc.line, loc.column)

      const failure: FailureData = { at }

      if (error) {
        const { expected, got } = this.parseExpectedGot(error)
        if (expected !== undefined && got !== undefined) {
          failure.expected = expected
          failure.got = got
        } else {
          failure.error = error.message
        }
      }

      failures.push(failure)
    }

    const mapToSkipped = (test: TestCase): SkippedData => ({
      at: this.formatLocation(test.location.file, test.location.line, test.location.column),
      name: test.title,
    })

    const mapToFlaky = (test: TestCase): FlakyData => ({
      at: this.formatLocation(test.location.file, test.location.line, test.location.column),
      name: test.title,
      retries: test.results.length - 1,
    })

    const report: ReportData = { passing: passedTests.length }
    if (flakyTests.length > 0) report.flaky = flakyTests.map(mapToFlaky)
    if (failures.length > 0) report.failing = failures
    if (todoTests.length > 0) report.todo = todoTests.map(mapToSkipped)
    if (skippedTests.length > 0) report.skipped = skippedTests.map(mapToSkipped)

    await this.writeReport(encode(report))
  }

  async writeReport(report: string): Promise<void> {
    if (this.options._captureOutput) {
      this.options._captureOutput(report)
      return
    }

    const outputFile = this.options.outputFile

    if (outputFile) {
      const reportFile = resolve(this.rootDir, outputFile)

      const outputDirectory = dirname(reportFile)
      if (!existsSync(outputDirectory)) {
        await fs.mkdir(outputDirectory, { recursive: true })
      }

      await fs.writeFile(reportFile, report, 'utf-8')
      console.log(`TOON report written to ${reportFile}`)
    } else {
      console.log(report)
    }
  }

  printsToStdio(): boolean {
    // Return true if we're printing to stdout (no outputFile)
    return !this.options.outputFile
  }
}

export default ToonPlaywrightReporter
