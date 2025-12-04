import type { SerializedError } from '@vitest/utils'
import { existsSync, promises as fs } from 'node:fs'
import { getTests } from '@vitest/runner/utils'
import { dirname, relative, resolve } from 'pathe'
import { getOutputFile } from './config-helpers'
import type { Reporter, TestRunEndReason } from './reporter'
import type { Vitest } from 'vitest/node'

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
}

export interface ToonFailure {
  at: string
  expected?: string
  got?: string
  error?: string
}

export interface ToonSkipped {
  at: string
  name: string
}

export interface ToonReport {
  passing: number
  failing?: ToonFailure[]
  skipped?: ToonSkipped[]
  todo?: ToonSkipped[]
}

export interface ToonReporterOptions {
  outputFile?: string
  color?: boolean
  /** @internal Used for testing to capture output */
  _captureOutput?: (output: string) => void
}

export class ToonReporter implements Reporter {
  start = 0
  ctx!: Vitest
  options: ToonReporterOptions

  constructor(options: ToonReporterOptions = {}) {
    this.options = {
      color: true,
      ...options,
    }
  }

  onInit(ctx: Vitest): void {
    this.ctx = ctx
    this.start = Date.now()
  }

  private parseLocation(error: any, rootDir: string): string | null {
    const stack = error?.stack || ''
    // Match file:line:column pattern in stack trace - find first line with actual file path
    const lines = stack.split('\n')
    for (const line of lines) {
      // Look for paths that look like actual source files (not node_modules)
      const match = line.match(/at\s+(?:.*?\s+\()?([^)\s]+):(\d+):(\d+)\)?/)
      if (match) {
        const [, filePath, lineNum, column] = match
        // Skip node_modules and internal files
        if (filePath.includes('node_modules') || filePath.startsWith('file:')) {
          continue
        }
        const relativePath = filePath.startsWith(rootDir)
          ? './' + relative(rootDir, filePath)
          : filePath
        return `${relativePath}:${lineNum}:${column}`
      }
    }
    return null
  }

  private parseExpectedGot(error: any): { expected?: string; got?: string } {
    const message = error?.message || ''

    // Try to extract expected/got from assertion error
    // Pattern: "expected X to be Y" or "expected X to equal Y"
    const matchToBe = message.match(/expected\s+(.+?)\s+to\s+(?:be|equal|deeply equal)\s+(.+?)(?:\s*\/\/|$)/i)
    if (matchToBe) {
      return { expected: matchToBe[2].trim(), got: matchToBe[1].trim() }
    }

    // Check for explicit Expected/Received in error
    if (error?.expected !== undefined && error?.actual !== undefined) {
      return { expected: String(error.expected), got: String(error.actual) }
    }

    return {}
  }

  async onTestRunEnd(
    testModules: ReadonlyArray<any>,
    _unhandledErrors: ReadonlyArray<SerializedError>,
    _reason: TestRunEndReason,
  ): Promise<void> {
    const files = testModules.map((testModule) => testModule.task)
    const tests = getTests(files)
    const rootDir = this.ctx.config.root

    const failedTests = tests.filter((t) => t.result?.state === 'fail')
    const passedCount = tests.filter((t) => t.result?.state === 'pass').length
    const skippedTests = tests.filter((t) => t.mode === 'skip')
    const todoTests = tests.filter((t) => t.mode === 'todo')

    // Build failures array
    const failures: ToonFailure[] = failedTests.map((t) => {
      const error = t.result?.errors?.[0]
      const location = this.parseLocation(error, rootDir)
      const { expected, got } = this.parseExpectedGot(error)

      const failure: ToonFailure = {
        at: location || `./${relative(rootDir, t.file.filepath)}:${t.location?.line || 0}:${t.location?.column || 0}`,
      }

      if (expected !== undefined && got !== undefined) {
        failure.expected = expected
        failure.got = got
      } else if (error) {
        // Non-assertion error (TypeError, etc.)
        failure.error = error.message || String(error)
      }

      return failure
    })

    // Build skipped array (line:column requires --includeTaskLocation flag)
    const skipped: ToonSkipped[] = skippedTests.map((t) => {
      const filePath = `./${relative(rootDir, t.file.filepath)}`
      const location = t.location ? `:${t.location.line}:${t.location.column}` : ''
      return { at: `${filePath}${location}`, name: t.name }
    })

    // Build todo array (line:column requires --includeTaskLocation flag)
    const todo: ToonSkipped[] = todoTests.map((t) => {
      const filePath = `./${relative(rootDir, t.file.filepath)}`
      const location = t.location ? `:${t.location.line}:${t.location.column}` : ''
      return { at: `${filePath}${location}`, name: t.name }
    })

    const output = this.formatOutput(passedCount, failures, skipped, todo)
    await this.writeReport(output)
  }

  private formatOutput(passing: number, failures: ToonFailure[], skipped: ToonSkipped[], todo: ToonSkipped[]): string {
    const useColor = this.options.color && !this.options.outputFile && !this.options._captureOutput && !process.env.NO_COLOR && !process.env.CI
    const { green, red, yellow, cyan, gray, reset } = useColor ? colors : { green: '', red: '', yellow: '', cyan: '', gray: '', reset: '' }

    const lines: string[] = []

    lines.push(`${green}passing: ${passing}${reset}`)

    if (failures.length > 0) {
      lines.push(`${red}failing[${failures.length}]:${reset}`)
      for (const failure of failures) {
        lines.push(`  - at: ${yellow}${failure.at}${reset}`)
        if (failure.expected !== undefined && failure.got !== undefined) {
          lines.push(`    expected: ${JSON.stringify(failure.expected)}`)
          lines.push(`    got: ${JSON.stringify(failure.got)}`)
        } else if (failure.error) {
          lines.push(`    error: ${failure.error}`)
        }
      }
    }

    if (skipped.length > 0) {
      lines.push(`${gray}skipped[${skipped.length}]:${reset}`)
      for (const s of skipped) {
        lines.push(`${gray}  - at: ${s.at}${reset}`)
        lines.push(`${gray}    name: ${s.name}${reset}`)
      }
    }

    if (todo.length > 0) {
      lines.push(`${cyan}todo[${todo.length}]:${reset}`)
      for (const t of todo) {
        lines.push(`  - at: ${yellow}${t.at}${reset}`)
        lines.push(`    name: ${t.name}`)
      }
    }

    return lines.join('\n')
  }

  async writeReport(report: string): Promise<void> {
    // If we have a capture function (for testing), use it
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

      await fs.writeFile(reportFile, report, 'utf-8')
      this.ctx.logger.log(`TOON report written to ${reportFile}`)
    } else {
      this.ctx.logger.log(report)
    }
  }
}
