"use client";

import { useEffect } from "react";
import { Dialog } from "@/components/panel/Dialog";
import { ScreenshotReview } from "@/components/panel/orders/ScreenshotReview";
import type { OrderControl } from "@/features/orders/staff-service";

/** Reviews the screenshot(s) waiting outside Need review (C22): products and/or delivery charge. */
export function CheckScreenshotDialog({
  items,
  onClose,
}: {
  items: OrderControl["toCheck"];
  onClose: () => void;
}) {
  useEffect(() => {
    if (items.length === 0) onClose();
  }, [items.length, onClose]);

  if (items.length === 0) return null;

  return (
    <Dialog open onClose={onClose} title="Check screenshot">
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <ScreenshotReview key={item.id} item={item} onDone={onClose} />
        ))}
      </div>
    </Dialog>
  );
}
