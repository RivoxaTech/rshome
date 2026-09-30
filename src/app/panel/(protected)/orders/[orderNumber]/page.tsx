import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PanelIcon, type PanelIconName } from "@/components/panel/icons";
import { ActivityTimeline } from "@/components/panel/orders/ActivityTimeline";
import { DetailActions } from "@/components/panel/orders/DetailActions";
import { OrderNoteForm } from "@/components/panel/orders/OrderNoteForm";
import { ProofList } from "@/components/panel/orders/ProofList";
import { WhatsAppLink } from "@/components/panel/orders/WhatsAppLink";
import { Avatar, Card, PAYMENT_TONES, Pill } from "@/components/panel/ui";
import { PERMISSIONS } from "@/features/auth/permissions";
import { orderNumberSchema } from "@/features/checkout/schemas";
import { backHrefSchema } from "@/features/orders/schemas";
import { getStaffOrder } from "@/features/orders/staff-service";
import { METHOD_PAGES, TAB_INFO } from "@/features/orders/transitions";
import { requirePermission } from "@/server/auth/permissions";

function Row({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function InfoLine({ icon, children }: { icon: PanelIconName; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-sm">
      <PanelIcon name={icon} className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border grid gap-2.5 border-t pt-4">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </div>
  );
}

/**
 * An order (REQUIREMENTS AD-03, owner decision C21, laid out like the reference): the header with
 * the stage's main action, items, screenshots, delivery, payment summary and activity on the
 * left; the customer, contact, address and note on the right (first on phones). The delivery charge is read-only
 * here once set; it is entered in the Approve dialog.
 */
export default async function StaffOrderPage({ params, searchParams }: PageProps<"/panel/orders/[orderNumber]">) {
  const session = await requirePermission(PERMISSIONS.ORDER_VIEW);
  const parsed = orderNumberSchema.safeParse((await params).orderNumber);
  if (!parsed.success) notFound();
  const order = await getStaffOrder(parsed.data, session.permissions);
  if (!order) notFound();

  const back = backHrefSchema.parse((await searchParams).from) ?? order.homeList;
  const { control, totals, delivery } = order;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const closed = control.tab === "cancelled" || control.tab === "rejected";

  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <Link href={back} className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1.5 justify-self-start text-sm font-medium transition-colors">
          <PanelIcon name="arrowLeft" className="h-4 w-4" />
          {METHOD_PAGES[order.paymentMethod].title}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl tracking-tight">Order {order.orderNumber}</h1>
              <Pill tone={control.tab}>{TAB_INFO[control.tab].label}</Pill>
              <Pill tone={PAYMENT_TONES[order.paymentStatus]}>{order.paymentStatusLabel}</Pill>
            </div>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <PanelIcon name="calendar" className="h-4 w-4" />
                {order.placedAt}
              </span>
              <span>{order.paymentMethodLabel}</span>
            </p>
            {control.waiting && <p className="text-status-pending-foreground text-sm font-medium">{control.waiting}</p>}
          </div>
          <div className="w-full sm:w-auto">
            <DetailActions control={control} />
          </div>
        </div>
      </header>

      {closed && (
        <p className="bg-status-rejected text-status-rejected-foreground rounded-xl px-4 py-3 text-sm leading-relaxed">
          <strong className="font-semibold">{TAB_INFO[control.tab].label}:</strong> {order.rejectionReason ?? "No reason recorded."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid gap-6">
          <Card title={`Items (${itemCount})`}>
            <ul className="divide-border -my-3 divide-y">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-3">
                  <div className="bg-muted border-border flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                    {item.image ? (
                      <Image src={item.image.path} alt={item.image.alt} width={64} height={64} sizes="64px" className="h-full w-full object-cover" />
                    ) : (
                      <PanelIcon name="image" className="text-muted-foreground h-6 w-6" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{item.name}</p>
                      {item.variantLabel && <p className="text-muted-foreground">{item.variantLabel}</p>}
                      <p className="text-muted-foreground text-xs">SKU {item.sku}</p>
                    </div>
                    <div className="flex items-baseline justify-between gap-6 text-sm sm:justify-end">
                      <p className="text-muted-foreground whitespace-nowrap tabular-nums">
                        {item.unitPrice} × {item.quantity}
                        {item.discount && <span className="block text-xs">− {item.discount} each</span>}
                      </p>
                      <p className="font-medium whitespace-nowrap tabular-nums">{item.lineTotal}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {order.proofs.length > 0 && (
            <Card title="Payment screenshots">
              <ProofList proofs={order.proofs} />
            </Card>
          )}

          <Card title="Delivery">
            <dl className="grid gap-2 text-sm">
              <Row label="Delivery charge" value={delivery.charge ?? <span className="text-muted-foreground">{closed ? "Not set" : "Set when approving"}</span>} />
              {delivery.note && <Row label="Note" value={delivery.note} />}
              {delivery.courier && <Row label="Courier" value={delivery.courier} />}
              {delivery.trackingNote && <Row label="Tracking" value={delivery.trackingNote} />}
            </dl>
          </Card>

          <Card title="Payment summary">
            <dl className="grid gap-2 text-sm">
              <Row label={`Subtotal (${itemCount} ${itemCount === 1 ? "item" : "items"})`} value={totals.subtotal} />
              {totals.discountTotal && <Row label="Discount" value={`− ${totals.discountTotal}`} />}
              {totals.coupon && <Row label={`Coupon (${totals.coupon.code})`} value={`− ${totals.coupon.discount}`} />}
              <Row label="Products" value={totals.goodsTotal} />
              <Row label="Delivery" value={totals.deliveryCharge ?? <span className="text-muted-foreground">Not set yet</span>} />
            </dl>
            <dl className="bg-muted -mx-4 mt-4 -mb-4 rounded-b-xl px-4 py-3.5 text-sm sm:-mx-5 sm:-mb-5 sm:px-5">
              <Row label={control.isCod ? "Total to collect in cash" : "Total"} value={totals.total} strong />
            </dl>
          </Card>

          <Card title="Activity">
            <div className="grid gap-6">
              {order.canAddNote && <OrderNoteForm orderNumber={order.orderNumber} />}
              <ActivityTimeline rows={order.history} />
            </div>
          </Card>
        </div>

        <Card title="Customer" className="max-lg:order-first">
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={order.customer.name} className="size-11 text-sm" />
              <p className="min-w-0 font-semibold break-words">{order.customer.name}</p>
            </div>
            <WhatsAppLink phone={order.whatsApp.phone} message={order.whatsApp.message} />
            <SideSection title="Contact info">
              <InfoLine icon="phone">
                <a href={`tel:+${order.customer.phoneDigits}`} className="hover:underline">
                  {order.customer.phone}
                </a>
              </InfoLine>
              {order.customer.email && (
                <InfoLine icon="mail">
                  <a href={`mailto:${order.customer.email}`} className="hover:underline">
                    {order.customer.email}
                  </a>
                </InfoLine>
              )}
            </SideSection>
            <SideSection title="Shipping address">
              <InfoLine icon="mapPin">
                {order.address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </InfoLine>
            </SideSection>
            {order.customerNote && (
              <SideSection title="Customer note">
                <InfoLine icon="note">
                  <span className="whitespace-pre-line">{order.customerNote}</span>
                </InfoLine>
              </SideSection>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
