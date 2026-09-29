import type { CartQuote } from "@/features/cart/quote";

const ROW = "flex items-center justify-between gap-4 text-xs tracking-[0.2em] uppercase";

/** Totals exactly as the server returned them; `deliveryNote` explains the pending delivery charge. */
export function CartSummary({ quote, deliveryNote, pending }: { quote: CartQuote; deliveryNote?: string; pending: boolean }) {
  return (
    <dl className={`grid gap-3 transition-opacity duration-300 ${pending ? "opacity-50" : ""}`}>
      <div className={ROW}>
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd>{quote.subtotal}</dd>
      </div>
      {quote.discountTotal && (
        <div className={ROW}>
          <dt className="text-muted-foreground">Discount</dt>
          <dd>− {quote.discountTotal}</dd>
        </div>
      )}
      {quote.coupon.status === "applied" && (
        <div className={ROW}>
          <dt className="text-muted-foreground">Coupon ({quote.coupon.code})</dt>
          <dd>− {quote.coupon.discount}</dd>
        </div>
      )}
      <div className={ROW}>
        <dt className="text-muted-foreground">Delivery</dt>
        <dd>{quote.delivery.status === "priced" ? quote.delivery.amount : "To be confirmed"}</dd>
      </div>
      {quote.delivery.status === "pending" && deliveryNote && (
        <p className="text-muted-foreground text-xs leading-relaxed normal-case">{deliveryNote}</p>
      )}
      <div className={`${ROW} border-border mt-2 border-t pt-4 text-sm`}>
        <dt>Total</dt>
        <dd>{quote.total}</dd>
      </div>
    </dl>
  );
}
