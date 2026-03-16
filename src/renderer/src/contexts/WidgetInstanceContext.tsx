import { createContext, useContext } from 'react'

export interface WidgetInstanceInfo {
  instanceId: string
  moduleId: string
  label: string | null
}

export const WidgetInstanceContext = createContext<WidgetInstanceInfo>({
  instanceId: '',
  moduleId: '',
  label: null
})

export function useWidgetInstance(): WidgetInstanceInfo {
  return useContext(WidgetInstanceContext)
}
