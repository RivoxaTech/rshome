import { CopyButton } from "@/components/ui/CopyButton";
import type { CustomerOrderView } from "@/features/orders/service";
import type { BankAccount } from "@/features/settings/schemas";
import { BankDetails } from "./BankDetails";
import { OrderProofUpload } from "./OrderProofUpload";

type Payment = CustomerOrderView["payment"];

const PROOF_LABEL: Record<Exclude<Payment["goods"] | Payment["delivery"], "not_due">, string> = {
  missing: "Screenshot needed",
  submitted: "Under review",
  verified: "Received",
  rejected: "Not accepted",
  awaiting_charge: "After approval",
};

function PaymentRow({ label, amount, status }: { label: string; amount: string; status: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <dt>
        <span className="text-muted-foreground block text-[10px] tracking-[0.28em] uppercase">{label}</span>
        <span className="mt-1 block text-sm">{amount}</span>
      </dt>
      <dd className="text-right text-[10px] tracking-[0.22em] uppercase">{status}</dd>
    </div>
  );
}

/** Where each part of a bank-transfer payment stands: the products (at checkout) and the delivery charge. */
function PaymentRows({ payment }: { payment: Payment }) {
  const goods = payment.goods === "not_due" ? "" : PROOF_LABEL[payment.goods];
  let delivery = "Nothing to pay";
  if (!payment.deliveryChargeByTransfer) delivery = "Cash on delivery";
  else if (payment.delivery !== "not_due") delivery = PROOF_LABEL[payment.delivery];
  return (
    <dl className="divide-border border-border divide-y border-y">
      <PaymentRow label="Products" amount={payment.goodsTotal} status={goods} />
      <PaymentRow label="Delivery charge" amount={payment.deliveryCharge ?? "To be confirmed"} status={delivery} />
    </dl>
  );
}

function UploadHeading({ upload }: { upload: NonNullable<Payment["upload"]> }) {
  if (upload.purpose === "delivery") return <>Pay the delivery charge of {upload.amount}</>;
  return <>Pay {upload.amount} for your products</>;
}

/**
 * What the customer must do to pay (owner decision, S8). A bank-transfer order paid its products
 * at checkout; once staff set the delivery charge, it is paid by a second transfer here (or in
 * cash on delivery, per `features.deliveryChargeByTransfer`). Rejecting a screenshot rejects the
 * whole order (owner decision, S9), so there is never a second chance to upload here.
 */
export function OrderPayment({ order, bankAccounts }: { order: CustomerOrderView; bankAccounts: BankAccount[] }) {
  const closed = order.orderStatus === "cancelled" || order.orderStatus === "rejected";
  const { payment } = order;

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
        {payment.deliveryCharge === null
          ? "You pay in cash when your order arrives."
          : `Pay ${order.totals.total} in cash when your order arrives: ${payment.goodsTotal} for the products and ${payment.deliveryCharge} for delivery.`}
      </p>
    );
  }

  const { upload } = payment;
  return (
    <div className="mt-4 grid gap-6">
      <PaymentRows payment={payment} />

      {upload ? (
        <div className="border-espresso/30 grid gap-6 border-l-2 pl-5">
          <div>
            <p className="font-serif text-2xl leading-tight">
              <UploadHeading upload={upload} />
            </p>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              Transfer {upload.amount} to the account below, then upload a screenshot of the transfer.
            </p>
          </div>
          <BankDetails accounts={bankAccounts} />
          <div>
            <p className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">Amount to transfer</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2">
              <p className="font-serif text-2xl">{upload.amount}</p>
              <CopyButton value={upload.amount.replace(/\D/g, "")} label="Copy amount" />
            </div>
          </div>
          <OrderProofUpload orderNumber={order.orderNumber} purpose={upload.purpose} />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm leading-relaxed">{nextStep(payment)}</p>
      )}
    </div>
  );
}

/** What happens next when nothing needs uploading: a review under way, the charge still to come, or paid. */
function nextStep(payment: Payment): string {
  const parts: string[] = [];
  if (payment.goods === "submitted" || payment.delivery === "submitted") parts.push("Thank you. We're checking your payment screenshot.");
  if (!payment.deliveryChargeByTransfer) {
    parts.push(
      payment.deliveryCharge
        ? `Pay the delivery charge of ${payment.deliveryCharge} in cash when your order arrives.`
        : "We'll set your delivery charge when we approve your order. You pay it in cash when your order arrives.",
    );
  } else if (payment.delivery === "awaiting_charge") {
    parts.push("Once we approve your order, you'll pay the delivery charge here by bank transfer.");
  }
  return parts.length > 0 ? parts.join(" ") : "Thank you, your payment is complete.";
}
