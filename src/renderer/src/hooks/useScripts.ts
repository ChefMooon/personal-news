import { useState, useEffect, useCallback } from 'react'
import type { ScriptWithLastRun, ScriptRunRecord, ScriptOutputChunk } from '../../../shared/ipc-types'
import { IPC } from '../../../shared/ipc-types'

interface UseScriptsReturn {
  scripts: ScriptWithLastRun[]
  loading: boolean
  runningIds: Set<number>
  outputLines: Map<number, ScriptOutputChunk[]>
  runScript: (id: number) => Promise<void>
  cancelScript: (id: number) => Promise<void>
  getRunHistory: (id: number) => Promise<ScriptRunRecord[]>
  refresh: () => void
}

export function useScripts(): UseScriptsReturn {
  const [scripts, setScripts] = useState<ScriptWithLastRun[]>([])
  const [loading, setLoading] = useState(true)
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set())
  const [outputLines, setOutputLines] = useState<Map<number, ScriptOutputChunk[]>>(new Map())

  const fetchScripts = useCallback((): void => {
    setLoading(true)
    window.api
      .invoke(IPC.SCRIPTS_GET_ALL)
      .then((data) => setScripts(data as ScriptWithLastRun[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchScripts()
  }, [fetchScripts])

  // Subscribe to push updates after a run completes — also clears runningIds
  useEffect(() => {
    const unsub = window.api.on(IPC.SCRIPTS_UPDATED, () => {
      fetchScripts()
      // Clear all running status on refresh; backend is the source of truth
      setRunningIds(new Set())
    })
    return unsub
  }, [fetchScripts])

  // Subscribe to live output chunks (capped to last 50 run IDs to prevent unbounded growth)
  useEffect(() => {
    const MAX_TRACKED_RUNS = 50
    const unsub = window.api.on(IPC.SCRIPTS_OUTPUT, (...args: unknown[]) => {
      const chunk = args[0] as ScriptOutputChunk
      setOutputLines((prev) => {
        const next = new Map(prev)
        next.set(chunk.runId, [...(next.get(chunk.runId) ?? []), chunk])
        if (next.size > MAX_TRACKED_RUNS) {
          const oldest = [...next.keys()].sort((a, b) => a - b)[0]
          next.delete(oldest)
        }
        return next
      })
    })
    return unsub
  }, [])

  const runScript = useCallback(async (id: number): Promise<void> => {
    setRunningIds((prev) => new Set(prev).add(id))
    try {
      await window.api.invoke(IPC.SCRIPTS_RUN, id)
      // runningIds will be cleared when SCRIPTS_UPDATED fires after the run completes
    } catch (err) {
      // If the IPC call itself fails, clear the spinner immediately
      console.error('[useScripts] runScript error:', err)
      setRunningIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  const cancelScript = useCallback(async (id: number): Promise<void> => {
    try {
      await window.api.invoke(IPC.SCRIPTS_CANCEL, id)
    } catch (err) {
      console.error('[useScripts] cancelScript error:', err)
    }
  }, [])

  const getRunHistory = useCallback(async (id: number): Promise<ScriptRunRecord[]> => {
    try {
      return (await window.api.invoke(IPC.SCRIPTS_GET_RUN_HISTORY, id)) as ScriptRunRecord[]
    } catch (err) {
      console.error('[useScripts] getRunHistory error:', err)
      return []
    }
  }, [])

  return {
    scripts,
    loading,
    runningIds,
    outputLines,
    runScript,
    cancelScript,
    getRunHistory,
    refresh: fetchScripts
  }
}

