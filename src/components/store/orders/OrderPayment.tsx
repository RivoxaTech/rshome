import type { CustomerOrderView } from "@/features/orders/service";
import type { BankAccount } from "@/features/settings/schemas";
import { BankDetails } from "./BankDetails";

/**
 * What the customer must do to pay. For bank transfer: the account details and the place the
 * screenshot upload goes (S8), which only opens once staff have set the delivery charge (PAY-06).
 */
export function OrderPayment({ order, bankAccounts }: { order: CustomerOrderView; bankAccounts: BankAccount[] }) {
  const closed = order.orderStatus === "cancelled" || order.orderStatus === "rejected";
  const awaitingQuote = order.orderStatus === "awaiting_shipping_quote";

  if (closed) {
    return (
      <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
        This order is closed, so no payment is due. Message us on WhatsApp if you have any questions.
      </p>
    );
  }

  if (order.paymentMethod === "cod") {
    return (
      <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
        Pay {order.totals.total} in cash when your order arrives.
        {awaitingQuote && " The delivery charge will be added once we confirm it with you on WhatsApp."}
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-6">
      <p className="text-muted-foreground text-sm leading-relaxed">
        {awaitingQuote
          ? "Once we confirm your delivery charge on WhatsApp, transfer the total to the account below and upload a screenshot of the transfer here."
          : `Transfer ${order.totals.total} to the account below and upload a screenshot of the transfer here.`}
      </p>

      <BankDetails accounts={bankAccounts} />

      <div className="border-espresso/30 border border-dashed px-6 py-8 text-center">
        <p className="text-[11px] tracking-[0.22em] uppercase">Payment screenshot</p>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          {awaitingQuote
            ? "The upload opens here once your delivery charge is confirmed."
            : "The upload arrives with the next update. Until then, send your screenshot on WhatsApp with your order number."}
        </p>
      </div>
    </div>
  );
}
