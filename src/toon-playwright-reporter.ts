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
  /** When true, shows per-test timing in passing[N]{at,name,ms} format */
  timing?: boolean
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

interface TimingData {
  at: string
  name: string
  ms: number
}

interface ReportData {
  duration?: string
  passing?: number | TimingData[]
  flaky?: FlakyData[]
  failing?: FailureData[]
  todo?: SkippedData[]
  skipped?: SkippedData[]
  error?: string
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const remaining = Math.round(ms % 1000)

  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s) parts.push(`${s}s`)
  if (remaining || parts.length === 0) parts.push(`${remaining}ms`)
  return parts.join('')
}

export class ToonPlaywrightReporter implements Reporter {
  private config!: FullConfig
  private suite!: Suite
  private options: ToonPlaywrightReporterOptions
  private testsDiscovered = 0
  private _didBegin = false

  constructor(options: ToonPlaywrightReporterOptions = {}) {
    this.options = options
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config
    this.suite = suite
    this.testsDiscovered = suite.allTests().length
    this._didBegin = true
  }

  private formatLocation(filePath: string, line?: number, column?: number): string {
    const relPath = relative(process.cwd(), filePath)
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
    // Handle case where onBegin was never called (early fatal error)
    if (!this._didBegin) {
      const report: ReportData = { error: 'Test run failed before initialization' }
      await this.writeReport(encode(report))
      return
    }

    const allTests = this.suite.allTests()

    // Handle empty test results
    if (allTests.length === 0) {
      let errorMessage: string
      if (this.testsDiscovered > 0) {
        // Tests were discovered in onBegin but not present in onEnd
        errorMessage = `${this.testsDiscovered} test(s) discovered but not executed`
      } else if (result.status === 'interrupted') {
        errorMessage = 'Test run was interrupted'
      } else if (result.status === 'timedout') {
        errorMessage = 'Test run timed out'
      } else {
        errorMessage = 'No test files found'
      }
      const report: ReportData = { error: errorMessage }
      await this.writeReport(encode(report))
      return
    }

    const passedTests: TestCase[] = []
    const failedTests: TestCase[] = []
    const skippedTests: TestCase[] = []
    const todoTests: TestCase[] = []
    const flakyTests: TestCase[] = []
    let testsWithResults = 0

    for (const test of allTests) {
      const lastResult = test.results[test.results.length - 1]
      if (!lastResult) continue
      testsWithResults++

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

    // Handle case where tests exist but none were executed (e.g., webServer timeout)
    if (testsWithResults === 0) {
      let errorMessage = `${allTests.length} test(s) discovered but not executed`
      if (result.status === 'timedout') {
        errorMessage += ' (timed out)'
      } else if (result.status === 'interrupted') {
        errorMessage += ' (interrupted)'
      }
      const report: ReportData = { error: errorMessage }
      await this.writeReport(encode(report))
      return
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

    const mapToTiming = (test: TestCase): TimingData => {
      const lastResult = test.results[test.results.length - 1]
      return {
        at: this.formatLocation(test.location.file, test.location.line, test.location.column),
        name: test.title,
        ms: Math.round(lastResult?.duration ?? 0),
      }
    }

    const report: ReportData = {}

    // Add duration and timing data if timing option is enabled
    if (this.options.timing) {
      report.duration = formatDuration(result.duration)
      report.passing = passedTests.map(mapToTiming)
    } else {
      report.passing = passedTests.length
    }

    if (flakyTests.length > 0) report.flaky = flakyTests.map(mapToFlaky)
    if (failures.length > 0) report.failing = failures
    if (todoTests.length > 0) report.todo = todoTests.map(mapToSkipped)
    if (skippedTests.length > 0) report.skipped = skippedTests.map(mapToSkipped)

    let output = encode(report)

    // Add (filtered) suffix when grep pattern is active
    const isFiltering = !!(this.config.grep || this.config.grepInvert)
    if (isFiltering) {
      output = output.replace(/^(passing: .+)$/m, '$1 (filtered)')
    }

    await this.writeReport(output)
  }

  async writeReport(report: string): Promise<void> {
    if (this.options._captureOutput) {
      this.options._captureOutput(report)
      return
    }

    const outputFile = this.options.outputFile

    if (outputFile) {
      const reportFile = resolve(this.config.rootDir, outputFile)

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
