"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createWholesaleInquiryAction } from "@/app/(store)/wholesale/actions";
import { WhatsAppButton, whatsAppHref } from "@/components/store/WhatsAppButton";
import { SelectField, TextAreaField, TextField } from "@/components/store/forms/fields";
import { EMPTY_ITEM_ROW, WholesaleItemRows, type WholesaleItemRow } from "@/components/store/wholesale/WholesaleItemRows";
import { fieldErrorsOf } from "@/features/checkout/schemas";
import { todayInKarachi, wholesaleInquiryInputSchema } from "@/features/wholesale/schemas";

// Dashed, not a plain solid line: a solid `border-t` here reads as just another field's
// underline (`CONTROL` in forms/fields.tsx is a solid `border-b`) rather than a section break.
const SECTION = "border-border/70 border-t border-dashed pt-8";

type BusinessTypeOption = { value: string; label: string };

type FormState = {
  name: string;
  business: string;
  businessType: string;
  phone: string;
  email: string;
  city: string;
  neededByDate: string;
  message: string;
  /** The honeypot: a real visitor never sees or reaches this field. */
  website: string;
};

/**
 * The wholesale inquiry form (REQUIREMENTS SF-08): mirrors `CheckoutForm.tsx` — the same Zod
 * schema validates client-side before the round trip, and again on the server. On success the
 * form is replaced by a thank-you state (no redirect, no cookie: there's no customer-facing page
 * to return to for an inquiry), so refreshing just shows the empty form again, never a resubmit.
 */
export function WholesaleForm({
  businessTypes,
  whatsappNumber,
  whatsappMessage,
}: {
  businessTypes: readonly BusinessTypeOption[];
  whatsappNumber: string;
  whatsappMessage: string;
}) {
  const [form, setForm] = useState<FormState>({
    name: "",
    business: "",
    businessType: businessTypes[0]?.value ?? "",
    phone: "",
    email: "",
    city: "",
    neededByDate: "",
    message: "",
    website: "",
  });
  const [items, setItems] = useState<WholesaleItemRow[]>([{ ...EMPTY_ITEM_ROW }]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});

    const payload = {
      name: form.name,
      business: form.business,
      businessType: form.businessType,
      phone: form.phone,
      email: form.email,
      city: form.city,
      neededByDate: form.neededByDate,
      items: items.map((row) => ({ itemName: row.itemName, quantity: row.quantity, note: row.note })),
      message: form.message,
      website: form.website,
    };

    // The same schema the server uses, so mistakes show at once without a round trip.
    const parsed = wholesaleInquiryInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error));
      setError("Please check the highlighted fields.");
      return;
    }

    startSubmit(async () => {
      let result: Awaited<ReturnType<typeof createWholesaleInquiryAction>>;
      try {
        result = await createWholesaleInquiryAction(payload);
      } catch {
        setError("Something went wrong sending your inquiry. Please check your connection and try again.");
        return;
      }
      if (result.ok) {
        setSubmitted(true);
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  if (submitted) {
    return (
      <div className="border-espresso/30 mt-12 max-w-xl border-l-2 pl-6">
        <p className="font-serif text-2xl">Thank you — we&apos;ve got your inquiry.</p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Our team will be in touch with pricing shortly. Message us on WhatsApp if you&apos;d like to follow up sooner.
        </p>
        <WhatsAppButton
          href={whatsAppHref(whatsappNumber, whatsappMessage)}
          label="Message us on WhatsApp"
          variant="full"
          className="mt-6 max-w-xs"
        />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-10 grid max-w-2xl gap-10">
      <section className="grid gap-6">
        <p className="eyebrow">Contact</p>
        <TextField
          id="name"
          label="Full name"
          autoComplete="name"
          required
          value={form.name}
          onChange={(event) => update({ name: event.target.value })}
          error={fieldErrors.name}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            id="business"
            label="Business name"
            autoComplete="organization"
            value={form.business}
            onChange={(event) => update({ business: event.target.value })}
            error={fieldErrors.business}
          />
          <SelectField
            id="businessType"
            label="Business type"
            required
            value={form.businessType}
            onChange={(event) => update({ businessType: event.target.value })}
            error={fieldErrors.businessType}
          >
            {businessTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            id="phone"
            label="Phone / WhatsApp"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            placeholder="03XX XXXXXXX"
            value={form.phone}
            onChange={(event) => update({ phone: event.target.value })}
            error={fieldErrors.phone}
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => update({ email: event.target.value })}
            error={fieldErrors.email}
          />
        </div>
      </section>

      <section className={`${SECTION} grid gap-6`}>
        <p className="eyebrow">Delivery</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            id="city"
            label="City"
            autoComplete="address-level2"
            required
            value={form.city}
            onChange={(event) => update({ city: event.target.value })}
            error={fieldErrors.city}
          />
          <TextField
            id="neededByDate"
            label="Needed by"
            type="date"
            min={todayInKarachi()}
            value={form.neededByDate}
            onChange={(event) => {
              update({ neededByDate: event.target.value });
              // Clears as soon as the field changes, rather than lingering until the next submit.
              setFieldErrors((current) => {
                if (!current.neededByDate) return current;
                const rest = { ...current };
                delete rest.neededByDate;
                return rest;
              });
            }}
            error={fieldErrors.neededByDate}
          />
        </div>
      </section>

      <section className={SECTION}>
        <p className="eyebrow mb-6">Items</p>
        <WholesaleItemRows rows={items} onChange={setItems} error={fieldErrors.items} />
      </section>

      <section className={SECTION}>
        <TextAreaField
          id="message"
          label="Message"
          placeholder="Anything else we should know"
          value={form.message}
          onChange={(event) => update({ message: event.target.value })}
          error={fieldErrors.message}
        />
      </section>

      {/* Honeypot (SF-08): hidden from people and screen readers, so only a bot filling every field reaches it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this field blank</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => update({ website: event.target.value })}
        />
      </div>

      {error && (
        <p role="alert" className="border-destructive text-destructive border-l-2 pl-4 text-xs leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-espresso text-background hover:bg-espresso/90 w-fit px-10 py-4 text-[11px] tracking-[0.28em] uppercase transition-colors disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send Inquiry"}
      </button>
    </form>
  );
}
