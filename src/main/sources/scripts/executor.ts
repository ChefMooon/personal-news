import { spawn, type ChildProcess } from 'child_process'
import type Database from 'better-sqlite3'
import type { ScriptWithLastRun, ScriptOutputChunk } from '../../../shared/ipc-types'

const OUTPUT_CAP_BYTES = 50 * 1024 // 50 KB

export interface ActiveRun {
  child: ChildProcess
  runId: number
}

export function runScript(
  db: Database.Database,
  script: ScriptWithLastRun,
  onOutput: (chunk: ScriptOutputChunk) => void,
  activeMap: Map<number, ActiveRun>
): Promise<void> {
  return new Promise((resolve) => {
    const args = script.args ? script.args.split(/\s+/).filter(Boolean) : []
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

    child.stdout?.on('data', (data: Buffer) => {
      const remaining = OUTPUT_CAP_BYTES - stdoutBytes
      if (remaining <= 0) {
        child.stdout?.pause()
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
        child.stderr?.pause()
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
      resolve()
    })

    child.on('error', (err) => {
      const finishedAt = Math.floor(Date.now() / 1000)
      db.prepare(
        'UPDATE script_runs SET finished_at = ?, exit_code = ?, stderr = ? WHERE id = ?'
      ).run(finishedAt, -1, err.message, runId)
      activeMap.delete(script.id)
      resolve()
    })
  })
}
