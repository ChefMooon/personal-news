import { spawn, type ChildProcess } from 'child_process'
import type Database from 'better-sqlite3'
import type { ScriptWithLastRun, ScriptOutputChunk } from '../../../shared/ipc-types'

const OUTPUT_CAP_BYTES = 1024 * 1024 // 1 MB
const FULL_STDOUT_CAP_BYTES = 5 * 1024 * 1024 // 5 MB

export interface ScriptRunOptions {
  extraArgs: string[]
  persistFullStdout: boolean
}

export interface ActiveRun {
  child: ChildProcess
  runId: number
}

export interface ScriptRunCompletion {
  runId: number
  scriptId: number
  startedAt: number
  finishedAt: number
  exitCode: number
  message: string
  stdout: string
  stderr: string
  stdoutTruncated: boolean
}

function parseArgString(rawArgs: string | null): string[] {
  if (!rawArgs) {
    return []
  }

  const matches = rawArgs.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g)
  if (!matches) {
    return []
  }

  return matches
    .map((part) => {
      if (
        (part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith("'") && part.endsWith("'"))
      ) {
        return part.slice(1, -1)
      }
      return part
    })
    .filter((part) => part.length > 0)
}

export function runScript(
  db: Database.Database,
  script: ScriptWithLastRun,
  options: ScriptRunOptions,
  onOutput: (chunk: ScriptOutputChunk) => void,
  activeMap: Map<number, ActiveRun>
): Promise<ScriptRunCompletion> {
  return new Promise((resolve) => {
    const args = [...parseArgString(script.args), ...options.extraArgs]
    const child = spawn(script.interpreter, [script.file_path, ...args], {
      cwd: undefined,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const now = Math.floor(Date.now() / 1000)
    const insertRun = db.prepare(
      'INSERT INTO script_runs (script_id, started_at) VALUES (?, ?)'
    )
    const result = insertRun.run(script.id, now)
    const runId = result.lastInsertRowid as number

    activeMap.set(script.id, { child, runId })

    let stdoutBuf = ''
    let stderrBuf = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    const persistAllStdout = options.persistFullStdout
    let stdoutTruncated = false

    child.stdout?.on('data', (data: Buffer) => {
      if (persistAllStdout) {
        const remaining = FULL_STDOUT_CAP_BYTES - stdoutBytes
        if (remaining <= 0) {
          stdoutTruncated = true
          return
        }
        const chunk = data.slice(0, remaining).toString('utf8')
        stdoutBuf += chunk
        stdoutBytes += Buffer.byteLength(chunk)
        onOutput({ runId, stream: 'stdout', text: chunk })
        if (Buffer.byteLength(data) > remaining) {
          stdoutTruncated = true
        }
        return
      }

      const remaining = OUTPUT_CAP_BYTES - stdoutBytes
      if (remaining <= 0) {
        return
      }
      const chunk = data.slice(0, remaining).toString('utf8')
      stdoutBuf += chunk
      stdoutBytes += Buffer.byteLength(chunk)
      onOutput({ runId, stream: 'stdout', text: chunk })
    })

    child.stderr?.on('data', (data: Buffer) => {
      const remaining = OUTPUT_CAP_BYTES - stderrBytes
      if (remaining <= 0) {
        return
      }
      const chunk = data.slice(0, remaining).toString('utf8')
      stderrBuf += chunk
      stderrBytes += Buffer.byteLength(chunk)
      onOutput({ runId, stream: 'stderr', text: chunk })
    })

    child.on('close', (code) => {
      const finishedAt = Math.floor(Date.now() / 1000)
      const exitCode = code ?? -1
      db.prepare(
        'UPDATE script_runs SET finished_at = ?, exit_code = ?, stdout = ?, stderr = ? WHERE id = ?'
      ).run(finishedAt, exitCode, stdoutBuf || null, stderrBuf || null, runId)
      activeMap.delete(script.id)
      const message = exitCode === 0 ? 'Script run completed successfully.' : `Script run exited with code ${exitCode}.`
      resolve({
        runId,
        scriptId: script.id,
        startedAt: now,
        finishedAt,
        exitCode,
        message,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        stdoutTruncated
      })
    })

    child.on('error', (err) => {
      const finishedAt = Math.floor(Date.now() / 1000)
      db.prepare(
        'UPDATE script_runs SET finished_at = ?, exit_code = ?, stderr = ? WHERE id = ?'
      ).run(finishedAt, -1, err.message, runId)
      activeMap.delete(script.id)
      resolve({
        runId,
        scriptId: script.id,
        startedAt: now,
        finishedAt,
        exitCode: -1,
        message: `Script process failed to start: ${err.message}`,
        stdout: stdoutBuf,
        stderr: err.message,
        stdoutTruncated
      })
    })
  })
}
