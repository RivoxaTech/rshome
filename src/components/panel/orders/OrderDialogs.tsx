"use client";

import { ApproveDialog } from "@/components/panel/orders/dialogs/ApproveDialog";
import { ApproveWhatsappDialog } from "@/components/panel/orders/dialogs/ApproveWhatsappDialog";
import { CheckScreenshotDialog } from "@/components/panel/orders/dialogs/CheckScreenshotDialog";
import { CloseOrderDialog } from "@/components/panel/orders/dialogs/CloseOrderDialog";
import { CompleteDialog } from "@/components/panel/orders/dialogs/CompleteDialog";
import { DeleteOrderDialog } from "@/components/panel/orders/dialogs/DeleteOrderDialog";
import { ShipDialog } from "@/components/panel/orders/dialogs/ShipDialog";
import type { OpenDialog } from "@/components/panel/orders/types";
import type { OrderControl } from "@/features/orders/staff-service";

/** Renders whichever dialog a row currently has open, or nothing. */
export function OrderDialogs({
  orderNumber,
  control,
  openDialog,
  approveStartsRejecting = false,
  onClose,
}: {
  orderNumber: string;
  control: OrderControl;
  openDialog: OpenDialog;
  /** The detail page's "Reject screenshot" quick link opens Approve straight into its reject form. */
  approveStartsRejecting?: boolean;
  onClose: () => void;
}) {
  switch (openDialog) {
    case "approve":
      return (
        <ApproveDialog
          orderNumber={orderNumber}
          isCod={control.isCod}
          goodsProof={control.goodsProof}
          goodsTotal={control.goodsTotal}
          startInReject={approveStartsRejecting}
          onClose={onClose}
        />
      );
    case "check_screenshot":
      return <CheckScreenshotDialog items={control.toCheck} onClose={onClose} />;
    case "approve_whatsapp":
      return <ApproveWhatsappDialog orderNumber={orderNumber} onClose={onClose} />;
    case "ship":
      return <ShipDialog orderNumber={orderNumber} onClose={onClose} />;
    case "complete":
      return <CompleteDialog orderNumber={orderNumber} isCod={control.isCod} onClose={onClose} />;
    case "cancel":
      return <CloseOrderDialog orderNumber={orderNumber} initialAction="cancel" onClose={onClose} />;
    case "reject":
      return <CloseOrderDialog orderNumber={orderNumber} initialAction="reject" onClose={onClose} />;
    case "close":
      return <CloseOrderDialog orderNumber={orderNumber} initialAction={null} onClose={onClose} />;
    case "delete":
      return <DeleteOrderDialog orderNumber={orderNumber} onClose={onClose} />;
    default:
      return null;
  }
}
