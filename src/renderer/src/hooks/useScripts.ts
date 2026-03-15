import { useState, useEffect } from 'react'
import type { ScriptWithLastRun } from '../../../shared/ipc-types'

export function useScripts(): { scripts: ScriptWithLastRun[]; loading: boolean } {
  const [scripts, setScripts] = useState<ScriptWithLastRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .invoke('scripts:getAll')
      .then((data) => {
        setScripts(data as ScriptWithLastRun[])
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  return { scripts, loading }
}
