import type { TestUserConfig } from 'vitest/node'
import { Readable, Writable } from 'node:stream'
import { startVitest } from 'vitest/node'

export interface RunVitestResult {
  stdout: string
  stderr: string
  exitCode: number | undefined
}

export async function runVitest(
  options: TestUserConfig,
  filters: string[] = [],
): Promise<RunVitestResult> {
  let stdoutContent = ''
  let stderrContent = ''

  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      stdoutContent += chunk.toString()
      callback()
    },
  })

  const stderr = new Writable({
    write(chunk, _encoding, callback) {
      stderrContent += chunk.toString()
      callback()
    },
  })

  const stdin = new Readable({ read: () => '' }) as NodeJS.ReadStream
  stdin.isTTY = false
  stdin.setRawMode = () => stdin

  let exitCode: number | undefined = 0

  const originalExitCode = process.exitCode
  process.exitCode = 0

  try {
    const ctx = await startVitest('test', filters, {
      watch: false,
      reporters: ['verbose'],
      ...options,
      env: {
        NO_COLOR: 'true',
        ...options.env,
      },
    }, {
      server: {
        ws: false,
      },
    }, {
      stdin,
      stdout,
      stderr,
    })

    await ctx?.close()
    exitCode = process.exitCode
  } catch (e) {
    stderrContent += String(e)
  } finally {
    process.exitCode = originalExitCode
  }

  return {
    stdout: stdoutContent,
    stderr: stderrContent,
    exitCode,
  }
}
