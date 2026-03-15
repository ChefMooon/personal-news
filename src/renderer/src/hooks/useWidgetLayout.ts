import { useState, useEffect } from 'react'
import type { WidgetLayout } from '../../../shared/ipc-types'

const DEFAULT_LAYOUT: WidgetLayout = {
  widget_order: ['youtube', 'reddit_digest', 'saved_posts'],
  widget_visibility: { youtube: true, reddit_digest: true, saved_posts: true }
}

export function useWidgetLayout(): {
  layout: WidgetLayout
  setLayout: (layout: WidgetLayout) => void
  loading: boolean
} {
  const [layout, setLayoutState] = useState<WidgetLayout>(DEFAULT_LAYOUT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .invoke('settings:getWidgetLayout')
      .then((data) => {
        setLayoutState(data as WidgetLayout)
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  const setLayout = (newLayout: WidgetLayout): void => {
    setLayoutState(newLayout)
    window.api.invoke('settings:setWidgetLayout', newLayout).catch(console.error)
  }

  return { layout, setLayout, loading }
}
