import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderPayment } from "@/components/store/orders/OrderPayment";
import { OrderTimeline } from "@/components/store/orders/OrderTimeline";
import { PageContainer } from "@/components/store/PageContainer";
import { WhatsAppButton, whatsAppHref } from "@/components/store/WhatsAppButton";
import { CopyButton } from "@/components/ui/CopyButton";
import { siteConfig } from "@/config/site.config";
import { hasOrderAccess } from "@/features/checkout/order-access-cookie";
import { orderNumberSchema } from "@/features/checkout/schemas";
import { getCustomerOrder } from "@/features/orders/service";
import { noindexRobots } from "@/features/seo/metadata";
import { getBankAccounts, getContactInfo, getStoreIdentity } from "@/features/settings/service";

export const metadata: Metadata = { robots: noindexRobots };

const ROW = "flex items-center justify-between gap-4 text-xs tracking-[0.2em] uppercase";
const SECTION = "border-border border-t pt-8";

/**
 * Confirmation and tracking in one page (REQUIREMENTS SF-06), read live from the database.
 * Needs the order-access cookie (ARCHITECTURE.md D1); without it the customer proves the order
 * is theirs at /track. Order: the number, payment, WhatsApp, items and totals, progress last.
 */
export default async function OrderPage({ params }: PageProps<"/order/[orderNumber]">) {
  const parsed = orderNumberSchema.safeParse((await params).orderNumber);
  if (!parsed.success) notFound();
  const orderNumber = parsed.data;
  if (!(await hasOrderAccess(orderNumber))) redirect(`/track?order=${encodeURIComponent(orderNumber)}`);

  const order = await getCustomerOrder(orderNumber);
  if (!order) notFound();
  const [contact, bankAccounts, identity] = await Promise.all([getContactInfo(), getBankAccounts(), getStoreIdentity()]);

  const whatsapp = whatsAppHref(
    contact.whatsapp,
    siteConfig.orderWhatsAppMessage.replace("{store}", identity.storeName).replace("{orderNumber}", order.orderNumber),
  );
  const { totals } = order;

  return (
    <PageContainer>
      <p className="eyebrow">Order {order.orderNumber}</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">{order.headline}</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        Placed {order.placedAt}. Thank you, {order.customer.name}.
      </p>

      {/* The number never breaks; on phones the copy control wraps under it when "Copied" shows. */}
      <div className="border-espresso/30 mt-8 border px-5 py-5 sm:inline-flex sm:items-center sm:gap-8 sm:px-6">
        <p className="eyebrow">Order number</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-0">
          <p className="font-serif text-2xl tracking-[0.08em] whitespace-nowrap sm:text-3xl sm:tracking-[0.12em] lg:text-4xl">
            {order.orderNumber}
          </p>
          <CopyButton value={order.orderNumber} label="Copy order number" />
        </div>
      </div>
      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
        Save this number to track your order at{" "}
        <Link href="/track" className="hover:text-champagne underline underline-offset-4 transition-colors">
          /track
        </Link>
        .
      </p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_420px] lg:gap-x-20">
        <div className="grid content-start gap-12">
          <section>
            <p className="eyebrow">Payment</p>
            <OrderPayment order={order} bankAccounts={bankAccounts} />
          </section>

          <section className={`${SECTION} flex items-start justify-between gap-6`}>
            <div>
              <p className="eyebrow">Questions?</p>
              <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed">
                Message us on WhatsApp and we&apos;ll reply with your order number to hand.
              </p>
            </div>
            <WhatsAppButton href={whatsapp} label="Message us on WhatsApp" size="large" className="mt-1" />
          </section>
        </div>

        <aside className="bg-card h-fit p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:p-8">
          <p className="eyebrow">Items</p>
          <ul className="divide-border mt-2 divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-serif text-lg leading-tight">{item.name}</p>
                  <p className="text-muted-foreground mt-1 text-[10px] tracking-[0.28em] uppercase">
                    {item.variantLabel && <span>{item.variantLabel} · </span>}
                    {item.quantity} × {item.unitPrice}
                  </p>
                </div>
                <p className="shrink-0 text-xs tracking-widest">{item.lineTotal}</p>
              </li>
            ))}
          </ul>

          <dl className="border-border mt-2 grid gap-3 border-t pt-6">
            <div className={ROW}>
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{totals.subtotal}</dd>
            </div>
            {totals.discountTotal && (
              <div className={ROW}>
                <dt className="text-muted-foreground">Discount</dt>
                <dd>− {totals.discountTotal}</dd>
              </div>
            )}
            {totals.coupon && (
              <div className={ROW}>
                <dt className="text-muted-foreground">Coupon ({totals.coupon.code})</dt>
                <dd>− {totals.coupon.discount}</dd>
              </div>
            )}
            <div className={ROW}>
              <dt className="text-muted-foreground">Delivery</dt>
              <dd>{totals.delivery.status === "priced" ? totals.delivery.amount : "Added on approval"}</dd>
            </div>
            {totals.delivery.status === "priced" && totals.delivery.note && (
              <p className="text-muted-foreground text-xs leading-relaxed">{totals.delivery.note}</p>
            )}
            <div className={`${ROW} border-border mt-2 border-t pt-4 text-sm`}>
              <dt>Total</dt>
              <dd>{totals.total}</dd>
            </div>
          </dl>

          <div className="border-border mt-8 border-t pt-6">
            <p className="eyebrow">Delivery to</p>
            <p className="mt-4 text-sm">{order.customer.name}</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {order.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
            <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
              {order.customer.phone}
              {order.customer.email && <span className="block">{order.customer.email}</span>}
            </p>
          </div>

          {order.note && (
            <div className="border-border mt-8 border-t pt-6">
              <p className="eyebrow">Your note</p>
              <p className="text-muted-foreground mt-4 text-xs leading-relaxed whitespace-pre-line">{order.note}</p>
            </div>
          )}
        </aside>

        <section className={`${SECTION} lg:col-start-1`}>
          <p className="eyebrow">Progress</p>
          <OrderTimeline steps={order.timeline} className="mt-6" />
        </section>
      </div>
    </PageContainer>
  );
}
