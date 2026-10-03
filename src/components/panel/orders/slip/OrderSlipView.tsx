import { AutoPrintTrigger } from "@/components/panel/orders/slip/AutoPrintTrigger";
import { PrintButton } from "@/components/panel/orders/slip/PrintButton";
import type { StaffOrderView } from "@/features/orders/staff-service";

/**
 * The printable packing slip (S18): black on white regardless of dark mode (plain Tailwind colour
 * classes, never the panel's theme tokens, so `data-theme="dark"` never leaks in here), A4/A5
 * margins, and a real `<thead>` so the item table's header repeats if it spans a second page. No
 * bank details, no internal notes, no payment proof — only what packing staff need to see.
 *
 * The browser's own print header/footer (date, page title, URL, page number) is drawn by the
 * browser itself, not this page — it isn't something a web page can reposition. The print
 * dialog's "More settings → Headers and footers" checkbox turns it off entirely for a cleaner
 * printout; `generateMetadata` in the page gives it a useful title either way.
 */
export function OrderSlipView({
  order,
  storeName,
  contactPhone,
  contactAddress,
  autoPrint,
}: {
  order: StaffOrderView;
  storeName: string;
  contactPhone: string;
  contactAddress: string;
  autoPrint: boolean;
}) {
  return (
    <div className="min-h-dvh bg-white text-black">
      <style>{`@media print { @page { size: A4; margin: 14mm; } }`}</style>
      {autoPrint && <AutoPrintTrigger />}

      <div className="mx-auto flex max-w-[800px] flex-col gap-6 p-6 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b border-black/30 pb-4">
          <div>
            <h1 className="text-xl font-bold">{storeName}</h1>
            <p className="text-sm text-black/70">{contactAddress}</p>
            <p className="text-sm text-black/70">{contactPhone}</p>
          </div>
          <div className="text-right whitespace-nowrap">
            <p className="text-lg font-semibold">Order {order.orderNumber}</p>
            <p className="text-sm text-black/70">{order.placedAt}</p>
            <PrintButton />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <h2 className="mb-1 font-semibold">Deliver to</h2>
            <p>{order.customer.name}</p>
            <p>{order.customer.phone}</p>
            {order.address.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
          <div>
            <h2 className="mb-1 font-semibold">Payment</h2>
            <p>
              {order.paymentMethodLabel} · {order.paymentStatusLabel}
            </p>
            {order.paymentMethod === "cod" && <p className="font-semibold">Amount to collect: {order.totals.total}</p>}
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black/40 text-left">
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2">Variant</th>
              <th className="py-2 pr-2">SKU</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Unit price</th>
              <th className="py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-black/10 break-inside-avoid">
                <td className="py-2 pr-2">{item.name}</td>
                <td className="py-2 pr-2">{item.variantLabel ?? "—"}</td>
                <td className="py-2 pr-2">{item.sku}</td>
                <td className="py-2 pr-2 text-right">{item.quantity}</td>
                <td className="py-2 pr-2 text-right">{item.unitPrice}</td>
                <td className="py-2 text-right">{item.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto flex w-full max-w-[280px] flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{order.totals.subtotal}</span>
          </div>
          {order.totals.discountTotal && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{order.totals.discountTotal}</span>
            </div>
          )}
          {order.totals.coupon && (
            <div className="flex justify-between">
              <span>Coupon ({order.totals.coupon.code})</span>
              <span>-{order.totals.coupon.discount}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Delivery charge</span>
            <span>{order.totals.deliveryCharge ?? "To be confirmed"}</span>
          </div>
          <div className="flex justify-between border-t border-black/30 pt-1 text-base font-bold">
            <span>Total</span>
            <span>{order.totals.total}</span>
          </div>
        </div>

        {order.customerNote && (
          <div className="text-sm">
            <h2 className="mb-1 font-semibold">Customer note</h2>
            <p>{order.customerNote}</p>
          </div>
        )}

        <div className="mt-6 border-t border-black/20 pt-4 text-sm">
          <p>Packed by: ____________________________</p>
        </div>
      </div>
    </div>
  );
}
