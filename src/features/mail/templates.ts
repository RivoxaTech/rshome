/**
 * Email bodies (BUILD_PLAN.md S21 Phase 2): pure builders, unit-tested. No client-specific text is
 * hard-coded here — the store's name and contact details are always passed in by the caller
 * (`features/mail/service.ts`, which reads `config/site.config.ts` and `features/settings`).
 */

export type StoreInfo = { name: string; phone: string; whatsapp: string; address: string };
export type MailContent = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function link(url: string, label: string): string {
  return `<p style="margin:0 0 12px;"><a href="${url}" style="color:#8a5a3a;">${escapeHtml(label)}</a></p>`;
}

/** A plain, readable shell: one heading, the body, a contact footer. No client text hard-coded. */
function wrap(store: StoreInfo, heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#faf7f2;font-family:Arial,Helvetica,sans-serif;color:#2a2420;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
      <h1 style="font-size:18px;margin:0 0 4px;">${escapeHtml(store.name)}</h1>
      <h2 style="font-size:15px;margin:0 0 16px;color:#5a4f45;font-weight:normal;">${escapeHtml(heading)}</h2>
      ${bodyHtml}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5ddd3;" />
      <p style="font-size:12px;color:#8a8077;margin:0;">
        ${escapeHtml(store.name)} &middot; ${escapeHtml(store.phone)} &middot; ${escapeHtml(store.address)}
      </p>
    </div>
  </body>
</html>`;
}

function footerText(store: StoreInfo): string {
  return `\n--\n${store.name}\n${store.phone}\n${store.address}`;
}

// ── Order received ──────────────────────────────────────────────────────────────────────────

export type OrderReceivedItem = { name: string; quantity: number; lineTotal: string };
export type OrderReceivedInput = {
  orderNumber: string;
  paymentMethod: "cod" | "bank_transfer";
  items: OrderReceivedItem[];
  productsTotal: string;
  nextStepsNote: string;
  orderUrl: string;
  store: StoreInfo;
};

export function buildOrderReceivedEmail(input: OrderReceivedInput): MailContent {
  const subject = `Order received — ${input.orderNumber}`;
  const paymentLine =
    input.paymentMethod === "bank_transfer"
      ? "We've received your payment screenshot for the products total; our team will check it shortly."
      : "You'll pay in cash on delivery.";

  const itemRows = input.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;">${escapeHtml(item.name)} &times; ${item.quantity}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(item.lineTotal)}</td></tr>`,
    )
    .join("");
  const itemLines = input.items.map((item) => `  ${item.name} x${item.quantity} — ${item.lineTotal}`).join("\n");

  const html = wrap(
    input.store,
    `Thanks for your order, ${input.orderNumber}`,
    `${paragraph(paymentLine)}
     <table style="width:100%;border-collapse:collapse;margin:0 0 12px;">${itemRows}</table>
     <p style="margin:0 0 12px;"><strong>Products total: ${escapeHtml(input.productsTotal)}</strong></p>
     ${paragraph(input.nextStepsNote)}
     ${link(input.orderUrl, "View your order")}`,
  );

  const text = `Thanks for your order, ${input.orderNumber}
${paymentLine}

${itemLines}

Products total: ${input.productsTotal}

${input.nextStepsNote}

View your order: ${input.orderUrl}
${footerText(input.store)}`;

  return { subject, html, text };
}

// ── Order approved ──────────────────────────────────────────────────────────────────────────

export type OrderApprovedInput = {
  orderNumber: string;
  paymentMethod: "cod" | "bank_transfer";
  deliveryCharge: string;
  total: string;
  /** Bank transfer only: a further transfer (and its screenshot) is still due. */
  dueByTransfer: boolean;
  orderUrl: string;
  store: StoreInfo;
};

export function buildOrderApprovedEmail(input: OrderApprovedInput): MailContent {
  const subject = `Order approved — ${input.orderNumber}`;

  const bodyLine =
    input.paymentMethod === "cod"
      ? `The delivery charge is ${input.deliveryCharge}, so your total to pay in cash on delivery is ${input.total}.`
      : input.dueByTransfer
        ? `The delivery charge is ${input.deliveryCharge}, so your new total is ${input.total}. Please pay it on your order page.`
        : `Your total is ${input.total}, including the delivery charge of ${input.deliveryCharge}. We're preparing your order now.`;

  const html = wrap(input.store, `Your order ${input.orderNumber} is approved`, `${paragraph(bodyLine)}${link(input.orderUrl, "View your order")}`);
  const text = `Your order ${input.orderNumber} is approved\n${bodyLine}\n\nView your order: ${input.orderUrl}${footerText(input.store)}`;

  return { subject, html, text };
}

// ── Order shipped ───────────────────────────────────────────────────────────────────────────

export type OrderShippedInput = {
  orderNumber: string;
  courier: string | null;
  trackingNote: string | null;
  orderUrl: string;
  store: StoreInfo;
};

export function buildOrderShippedEmail(input: OrderShippedInput): MailContent {
  const subject = `Order on its way — ${input.orderNumber}`;
  const details = [input.courier, input.trackingNote].filter(Boolean).join(" · ");
  const bodyLine = details ? `Your order is on its way: ${details}.` : "Your order is on its way.";

  const html = wrap(input.store, `Order ${input.orderNumber} shipped`, `${paragraph(bodyLine)}${link(input.orderUrl, "View your order")}`);
  const text = `Order ${input.orderNumber} shipped\n${bodyLine}\n\nView your order: ${input.orderUrl}${footerText(input.store)}`;

  return { subject, html, text };
}

// ── Order rejected / cancelled ──────────────────────────────────────────────────────────────

export type OrderClosedInput = {
  orderNumber: string;
  action: "rejected" | "cancelled";
  reason: string;
  orderUrl: string;
  store: StoreInfo;
};

export function buildOrderClosedEmail(input: OrderClosedInput): MailContent {
  const subject = `Order ${input.action} — ${input.orderNumber}`;
  const bodyLine = `Your order ${input.orderNumber} has been ${input.action}: ${input.reason}`;

  const html = wrap(input.store, `Order ${input.action}`, `${paragraph(bodyLine)}${link(input.orderUrl, "View your order")}`);
  const text = `Order ${input.action}\n${bodyLine}\n\nView your order: ${input.orderUrl}${footerText(input.store)}`;

  return { subject, html, text };
}

// ── Owner alert (new order / screenshot / wholesale inquiry) ──────────────────────────────────

export type OwnerAlertInput = {
  title: string;
  /** The order number, or null for a wholesale inquiry (no order number). */
  orderNumber: string | null;
  url: string;
  store: StoreInfo;
};

/** Same no-personal-data rule as the push payload (ARCHITECTURE.md §4.2 step 10): order number and a link only. */
export function buildOwnerAlertEmail(input: OwnerAlertInput): MailContent {
  const subject = input.title;
  const bodyLine = input.orderNumber ? `Order ${input.orderNumber}.` : "A new wholesale inquiry was submitted.";

  const html = wrap(input.store, input.title, `${paragraph(bodyLine)}${link(input.url, "Open in the panel")}`);
  const text = `${input.title}\n${bodyLine}\n\nOpen in the panel: ${input.url}${footerText(input.store)}`;

  return { subject, html, text };
}
