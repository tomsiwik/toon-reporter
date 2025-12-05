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

// OSC 8 hyperlink helpers
function link(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`
}

function fileLink(filePath: string, line?: number, column?: number): string {
  // file:// URL with line/column for editor integration
  let url = `file://${filePath}`
  if (line) {
    url += `:${line}`
    if (column) {
      url += `:${column}`
    }
  }
  return url
}

export interface ToonFailureAssertion {
  expected?: string
  got?: string
  error?: string
}

export interface ToonFailure {
  at: string
  absPath: string
  line?: number
  column?: number
  expected?: string
  got?: string
  error?: string
  each?: boolean
}

export interface ToonSkipped {
  at: string
  absPath: string
  line?: number
  column?: number
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

  private parseLocation(error: any, rootDir: string): { absPath: string; relPath: string; line: number; column: number } | null {
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
        const absPath = filePath.startsWith(rootDir) ? filePath : resolve(rootDir, filePath)
        const relPath = relative(rootDir, absPath)
        return {
          absPath,
          relPath,
          line: parseInt(lineNum, 10),
          column: parseInt(column, 10),
        }
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
      const parsed = this.parseLocation(error, rootDir)
      const { expected, got } = this.parseExpectedGot(error)

      // Use parsed location from stack trace, or fall back to test location
      const absPath = parsed?.absPath || t.file.filepath
      const relPath = parsed?.relPath || relative(rootDir, t.file.filepath)
      const line = parsed?.line || t.location?.line
      const column = parsed?.column || t.location?.column

      const failure: ToonFailure = {
        at: line ? `${relPath}:${line}:${column || 0}` : relPath,
        absPath,
        line,
        column,
        each: t.each,
      }

      if (expected !== undefined && got !== undefined) {
        failure.expected = expected
        failure.got = got
      } else if (error) {
        // Non-assertion error (TypeError, etc.)
        let message = error.message || String(error)
        // Timeout errors have multi-line messages with hints - take first line only
        if (message.startsWith('Test timed out')) {
          message = message.split('\n')[0]
        }
        // Prefix with error type if it's a specific error (not generic Error)
        const errorName = error.name
        if (errorName && errorName !== 'Error' && !message.startsWith(errorName)) {
          message = `${errorName}: ${message}`
        }
        failure.error = message
      }

      return failure
    })

    // Build skipped array (line:column requires --includeTaskLocation flag)
    const skipped: ToonSkipped[] = skippedTests.map((t) => {
      const relPath = relative(rootDir, t.file.filepath)
      const line = t.location?.line
      const column = t.location?.column
      return {
        at: line ? `${relPath}:${line}:${column || 0}` : relPath,
        absPath: t.file.filepath,
        line,
        column,
        name: t.name,
      }
    })

    // Build todo array (line:column requires --includeTaskLocation flag)
    const todo: ToonSkipped[] = todoTests.map((t) => {
      const relPath = relative(rootDir, t.file.filepath)
      const line = t.location?.line
      const column = t.location?.column
      return {
        at: line ? `${relPath}:${line}:${column || 0}` : relPath,
        absPath: t.file.filepath,
        line,
        column,
        name: t.name,
      }
    })

    const output = this.formatOutput(passedCount, failures, skipped, todo)
    await this.writeReport(output)
  }

  /**
   * Quote a string value per TOON spec:
   * - Quote if contains delimiter (comma), newline, carriage return, tab, backslash, or quote
   * - Quote if matches reserved keywords (true, false, null)
   * - Quote if looks like a number but should be a string
   */
  private toonQuote(value: string, delimiter: string = ','): string {
    // Check if quoting is needed
    const needsQuote =
      value.includes(delimiter) ||
      value.includes('\n') ||
      value.includes('\r') ||
      value.includes('\t') ||
      value.includes('\\') ||
      value.includes('"') ||
      value === 'true' ||
      value === 'false' ||
      value === 'null' ||
      /^-?\d+(\.\d+)?$/.test(value) // looks like a number

    if (!needsQuote) {
      return value
    }

    // Escape per TOON spec: only \\ \" \n \r \t are valid
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')

    return `"${escaped}"`
  }

  private formatOutput(passing: number, failures: ToonFailure[], skipped: ToonSkipped[], todo: ToonSkipped[]): string {
    const useColor = this.options.color && !this.options.outputFile && !this.options._captureOutput && !process.env.NO_COLOR && !process.env.CI
    const { green, red, yellow, cyan, gray, reset } = useColor ? colors : { green: '', red: '', yellow: '', cyan: '', gray: '', reset: '' }

    // Helper to format a file location with optional hyperlink
    const formatLocation = (at: string, absPath: string, line?: number, column?: number, color: string = yellow): string => {
      if (useColor) {
        const url = fileLink(absPath, line, column)
        return `${color}${link(url, at)}${reset}`
      }
      return at
    }

    const lines: string[] = []

    lines.push(`${green}passing: ${passing}${reset}`)

    if (failures.length > 0) {
      lines.push(`${red}failing[${failures.length}]:${reset}`)

      // Group parameterized (.each) failures by location
      const grouped = new Map<string, ToonFailure[]>()
      const regular: ToonFailure[] = []

      for (const failure of failures) {
        if (failure.each) {
          const key = failure.at
          if (!grouped.has(key)) {
            grouped.set(key, [])
          }
          grouped.get(key)!.push(failure)
        } else {
          regular.push(failure)
        }
      }

      // Output regular failures
      for (const failure of regular) {
        lines.push(`- at: ${formatLocation(failure.at, failure.absPath, failure.line, failure.column)}`)
        if (failure.expected !== undefined && failure.got !== undefined) {
          lines.push(`  expected: ${this.toonQuote(failure.expected)}`)
          lines.push(`  got: ${this.toonQuote(failure.got)}`)
        } else if (failure.error) {
          lines.push(`  error: ${this.toonQuote(failure.error)}`)
        }
      }

      // Output grouped parameterized failures using tabular format
      for (const [, groupedFailures] of grouped) {
        const first = groupedFailures[0]
        lines.push(`- at: ${formatLocation(first.at, first.absPath, first.line, first.column)}`)

        // Check if all failures have expected/got (assertion errors) or all have error
        const hasExpectedGot = groupedFailures.every(f => f.expected !== undefined && f.got !== undefined)

        if (hasExpectedGot) {
          lines.push(`  parameters[${groupedFailures.length}]{expected,got}:`)
          for (const failure of groupedFailures) {
            lines.push(`    ${this.toonQuote(failure.expected!)},${this.toonQuote(failure.got!)}`)
          }
        } else {
          // Mixed or error-only - use error tabular format
          lines.push(`  parameters[${groupedFailures.length}]{error}:`)
          for (const failure of groupedFailures) {
            if (failure.error) {
              lines.push(`    ${this.toonQuote(failure.error)}`)
            }
          }
        }
      }
    }

    // Use tabular format for todo (uniform structure)
    if (todo.length > 0) {
      lines.push(`${cyan}todo[${todo.length}]{at,name}:${reset}`)
      for (const t of todo) {
        const at = formatLocation(t.at, t.absPath, t.line, t.column)
        lines.push(`${cyan}  ${at},${this.toonQuote(t.name)}${reset}`)
      }
    }

    // Use tabular format for skipped (uniform structure)
    if (skipped.length > 0) {
      lines.push(`${gray}skipped[${skipped.length}]{at,name}:${reset}`)
      for (const s of skipped) {
        const at = formatLocation(s.at, s.absPath, s.line, s.column, gray)
        lines.push(`${gray}  ${at},${this.toonQuote(s.name)}${reset}`)
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
