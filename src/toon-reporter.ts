import type { SerializedError } from '@vitest/utils'
import { existsSync, promises as fs } from 'node:fs'
import { dirname, relative, resolve } from 'pathe'
import { getTests } from '@vitest/runner/utils'
import { encode } from '@toon-format/toon'
import type { Reporter, TestRunEndReason, Vitest } from 'vitest/node'

function getOutputFile(
  config: { outputFile?: string | Partial<Record<string, string>> } | undefined,
  reporter: string,
): string | undefined {
  if (!config?.outputFile) return
  if (typeof config.outputFile === 'string') return config.outputFile
  return config.outputFile[reporter]
}

// ANSI color codes
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
}

function shouldUseColor(option?: boolean): boolean {
  // CI always disables color
  if (process.env.CI) return false
  // Explicit option takes precedence
  if (option !== undefined) return option
  // COLOR env var enables color
  return !!process.env.COLOR
}

export interface ToonReporterOptions {
  outputFile?: string
  color?: boolean
  /** Include per-file coverage percentages (lines, stmts, branch, funcs) */
  verbose?: boolean
  /** @internal Used for testing to capture output */
  _captureOutput?: (output: string) => void
}

interface FailureData {
  at: string
  expected?: string
  got?: string
  error?: string
  parameters?: Array<{ expected: string; got: string } | { error: string }>
}

interface SkippedData {
  at: string
  name: string
}

interface FileCoverageEntry {
  file: string
  'lines%'?: number
  'stmts%'?: number
  'branch%'?: number
  'funcs%'?: number
  uncoveredLines: string
}

interface CoverageTotal {
  lines: number
  stmts: number
  branch: number
  funcs: number
}

interface CoverageData {
  'total%': CoverageTotal
  files?: FileCoverageEntry[]
}

interface ReportData {
  passing: number
  failing?: FailureData[]
  todo?: SkippedData[]
  skipped?: SkippedData[]
  coverage?: CoverageData
}

export class ToonReporter implements Reporter {
  start = 0
  ctx!: Vitest
  options: ToonReporterOptions
  private useColor: boolean
  private coverageMap: unknown

  constructor(options: ToonReporterOptions = {}) {
    this.options = options
    this.useColor = shouldUseColor(options.color)
  }

  onInit(ctx: Vitest): void {
    this.ctx = ctx
    this.start = Date.now()
    this.coverageMap = undefined
  }

  onCoverage(coverage: unknown): void {
    this.coverageMap = coverage
  }

  private getCoverageSummary(): CoverageData | undefined {
    if (!this.coverageMap) return undefined
    type IstanbulFileCoverage = {
      toSummary: () => { toJSON: () => Record<string, { pct: number }> }
      getUncoveredLines: () => number[]
    }
    type CoverageMap = {
      getCoverageSummary?: () => { toJSON: () => Record<string, { pct: number }> }
      files?: () => string[]
      fileCoverageFor?: (file: string) => IstanbulFileCoverage
    }
    const map = this.coverageMap as CoverageMap
    if (typeof map.getCoverageSummary !== 'function') return undefined

    const summary = map.getCoverageSummary().toJSON()
    const rootDir = this.ctx.config.root

    const result: CoverageData = {
      'total%': {
        lines: summary.lines?.pct ?? 0,
        stmts: summary.statements?.pct ?? 0,
        branch: summary.branches?.pct ?? 0,
        funcs: summary.functions?.pct ?? 0,
      },
    }

    // Include per-file coverage
    // Default: only files with uncovered lines
    // Verbose: all files with percentages
    if (map.files && map.fileCoverageFor) {
      const entries: FileCoverageEntry[] = []
      const verbose = this.options.verbose
      for (const file of map.files()) {
        const fc = map.fileCoverageFor(file)
        const uncoveredLines = fc.getUncoveredLines()
        const hasGaps = uncoveredLines.length > 0

        // In non-verbose mode, skip files with 100% coverage
        if (!verbose && !hasGaps) continue

        const entry: FileCoverageEntry = {
          file: relative(rootDir, file),
          uncoveredLines: this.formatLineRanges(uncoveredLines),
        }
        if (verbose) {
          const fileSummary = fc.toSummary().toJSON()
          entry['lines%'] = fileSummary.lines?.pct ?? 0
          entry['stmts%'] = fileSummary.statements?.pct ?? 0
          entry['branch%'] = fileSummary.branches?.pct ?? 0
          entry['funcs%'] = fileSummary.functions?.pct ?? 0
        }
        entries.push(entry)
      }
      if (entries.length > 0) result.files = entries
    }

    return result
  }

  private formatLineRanges(lines: (number | string)[]): string {
    if (lines.length === 0) return ''
    const sorted = lines.map(Number).sort((a, b) => a - b)
    const ranges: string[] = []
    let start = sorted[0]
    let end = start

    for (let i = 1; i <= sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i]
      } else {
        ranges.push(start === end ? String(start) : `${start}-${end}`)
        start = sorted[i]
        end = start
      }
    }
    return ranges.join(',')
  }

  private formatLocation(relPath: string, line?: number, column?: number): string {
    return line ? `${relPath}:${line}:${column || 0}` : relPath
  }

  private parseErrorLocation(error: any, rootDir: string): { relPath: string; line: number; column: number } | null {
    const stack = error?.stack || ''
    for (const line of stack.split('\n')) {
      const match = line.match(/at\s+(?:.*?\s+\()?([^)\s]+):(\d+):(\d+)\)?/)
      if (match) {
        const [, filePath, lineNum, col] = match
        if (filePath.includes('node_modules') || filePath.startsWith('file:')) continue
        const absPath = filePath.startsWith(rootDir) ? filePath : resolve(rootDir, filePath)
        return { relPath: relative(rootDir, absPath), line: parseInt(lineNum, 10), column: parseInt(col, 10) }
      }
    }
    return null
  }

  private parseExpectedGot(error: any): { expected?: string; got?: string } {
    const message = error?.message || ''
    const match = message.match(/expected\s+(.+?)\s+to\s+(?:be|equal|deeply equal)\s+(.+?)(?:\s*\/\/|$)/i)
    if (match) return { expected: match[2].trim(), got: match[1].trim() }
    if (error?.expected !== undefined && error?.actual !== undefined) {
      return { expected: String(error.expected), got: String(error.actual) }
    }
    return {}
  }

  private formatErrorMessage(error: any): string {
    let message = error.message || String(error)
    if (message.startsWith('Test timed out')) message = message.split('\n')[0]
    const name = error.name
    if (name && name !== 'Error' && !message.startsWith(name)) message = `${name}: ${message}`
    return message
  }

  async onTestRunEnd(
    testModules: ReadonlyArray<any>,
    _unhandledErrors: ReadonlyArray<SerializedError>,
    _reason: TestRunEndReason,
  ): Promise<void> {
    const files = testModules.map((m) => m.task)
    const tests = getTests(files)
    const rootDir = this.ctx.config.root

    const failedTests = tests.filter((t) => t.result?.state === 'fail')
    const passedCount = tests.filter((t) => t.result?.state === 'pass').length
    const skippedTests = tests.filter((t) => t.mode === 'skip')
    const todoTests = tests.filter((t) => t.mode === 'todo')

    // Group parameterized (.each) failures by location
    const grouped = new Map<string, Array<{ expected?: string; got?: string; error?: string }>>()
    const failures: FailureData[] = []

    for (const t of failedTests) {
      const error = t.result?.errors?.[0]
      const loc = this.parseErrorLocation(error, rootDir)
      const { expected, got } = this.parseExpectedGot(error)
      const relPath = loc?.relPath || relative(rootDir, t.file.filepath)
      const at = this.formatLocation(relPath, loc?.line || t.location?.line, loc?.column || t.location?.column)

      if (t.each) {
        if (!grouped.has(at)) grouped.set(at, [])
        grouped.get(at)!.push(expected !== undefined && got !== undefined
          ? { expected, got }
          : { error: this.formatErrorMessage(error) })
      } else {
        const failure: FailureData = { at }
        if (expected !== undefined && got !== undefined) {
          failure.expected = expected
          failure.got = got
        } else if (error) {
          failure.error = this.formatErrorMessage(error)
        }
        failures.push(failure)
      }
    }

    for (const [at, params] of grouped) {
      failures.push({ at, parameters: params as FailureData['parameters'] })
    }

    const mapToSkipped = (t: any): SkippedData => ({
      at: this.formatLocation(relative(rootDir, t.file.filepath), t.location?.line, t.location?.column),
      name: t.name,
    })

    const report: ReportData = { passing: passedCount }
    if (failures.length > 0) report.failing = failures
    if (todoTests.length > 0) report.todo = todoTests.map(mapToSkipped)
    if (skippedTests.length > 0) report.skipped = skippedTests.map(mapToSkipped)

    const coverage = this.getCoverageSummary()
    if (coverage) report.coverage = coverage

    await this.writeReport(encode(report))
  }

  private colorize(report: string): string {
    if (!this.useColor) return report
    return report
      .replace(/^(passing:)/m, colors.green('$1'))
      .replace(/^(failing\[.*?\]:)/m, colors.red('$1'))
      .replace(/^(todo\[.*?\]:)/m, colors.cyan('$1'))
      .replace(/^(skipped\[.*?\]:)/m, colors.gray('$1'))
      .replace(/at: "([^"]+)"/g, `at: "${colors.yellow('$1')}"`)
      .replace(/("at",)([^,\n]+)/g, `$1${colors.yellow('$2')}`)
  }

  async writeReport(report: string): Promise<void> {
    if (this.options._captureOutput) {
      this.options._captureOutput(report)
      return
    }

    const outputFile =
      this.options.outputFile ?? getOutputFile(this.ctx.config, 'toon')

    if (outputFile) {
      const reportFile = resolve(this.ctx.config.root, outputFile)

      const outputDirectory = dirname(reportFile)
      if (!existsSync(outputDirectory)) {
        await fs.mkdir(outputDirectory, { recursive: true })
      }

      // Never colorize file output
      await fs.writeFile(reportFile, report, 'utf-8')
      this.ctx.logger.log(`TOON report written to ${reportFile}`)
    } else {
      this.ctx.logger.log(this.colorize(report))
    }
  }
}
