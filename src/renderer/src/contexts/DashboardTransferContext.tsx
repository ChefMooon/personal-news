import { createContext, useContext } from 'react'

interface DashboardTransferContextValue {
  openTransferDialog: (instanceId: string) => void
}

const noop = (): void => {}

export const DashboardTransferContext = createContext<DashboardTransferContextValue>({
  openTransferDialog: noop
})

export function useDashboardTransfer(): DashboardTransferContextValue {
  return useContext(DashboardTransferContext)
}