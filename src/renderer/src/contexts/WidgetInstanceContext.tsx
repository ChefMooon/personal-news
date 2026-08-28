import { createContext, useContext } from "react";
import type { WidgetSize } from "../../../shared/ipc-types";

export interface WidgetInstanceInfo {
  instanceId: string;
  moduleId: string;
  label: string | null;
  size: WidgetSize;
  editMode: boolean;
  onSizeChange: (size: WidgetSize) => void;
  onRuntimeRowsChange: (rows: number) => void;
}

export const WidgetInstanceContext = createContext<WidgetInstanceInfo>({
  instanceId: "",
  moduleId: "",
  label: null,
  size: "medium",
  editMode: false,
  onSizeChange: () => undefined,
  onRuntimeRowsChange: () => undefined,
});

export function useWidgetInstance(): WidgetInstanceInfo {
  return useContext(WidgetInstanceContext);
}
