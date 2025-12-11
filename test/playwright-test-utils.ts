import { spawn } from 'node:child_process'
import { dirname, resolve } from 'pathe'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface RunPlaywrightResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface RunPlaywrightOptions {
  testFiles?: string[]
  config?: string
}

export async function runPlaywright(
  testFilesOrOptions: string[] | RunPlaywrightOptions = [],
): Promise<RunPlaywrightResult> {
  const fixturesDir = resolve(__dirname, 'playwright-fixtures')

  // Support both array of files and options object
  const options: RunPlaywrightOptions = Array.isArray(testFilesOrOptions)
    ? { testFiles: testFilesOrOptions }
    : testFilesOrOptions
  const testFiles = options.testFiles || []
  const configFile = options.config || 'playwright.config.ts'

  return new Promise((resolvePromise) => {
    const args = [
      'playwright',
      'test',
      '--config',
      resolve(fixturesDir, configFile),
      ...testFiles,
    ]

    const proc = spawn('npx', args, {
      cwd: fixturesDir,
      env: {
        ...process.env,
        // Disable color for predictable output
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        CI: '1',
      },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (exitCode) => {
      resolvePromise({
        stdout,
        stderr,
        exitCode,
      })
    })
  })
}
