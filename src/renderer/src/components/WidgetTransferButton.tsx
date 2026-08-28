import React from "react";
import { ArrowRightLeft } from "lucide-react";
import { useDashboardTransfer } from "../contexts/DashboardTransferContext";

interface WidgetTransferButtonProps {
  instanceId: string;
}

export function WidgetTransferButton({
  instanceId,
}: WidgetTransferButtonProps): React.ReactElement {
  const { openTransferDialog } = useDashboardTransfer();

  return (
    <button
      type="button"
      className="rounded p-0 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      onClick={() => openTransferDialog(instanceId)}
      title="Move or copy to another dashboard"
      aria-label="Move or copy widget to another dashboard"
    >
      <ArrowRightLeft className="h-4 w-4" />
    </button>
  );
}
