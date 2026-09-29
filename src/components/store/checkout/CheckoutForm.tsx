"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { createOrderAction } from "@/app/(store)/checkout/actions";
import { useCart } from "@/components/store/cart/CartProvider";
import { SelectField, TextAreaField, TextField } from "@/components/store/forms/fields";
import { BankDetails } from "@/components/store/orders/BankDetails";
import { ProofUpload } from "@/components/store/orders/ProofUpload";
import { CopyButton } from "@/components/ui/CopyButton";
import type { CountryOption } from "@/config/countries";
import { checkoutInputSchema, fieldErrorsOf } from "@/features/checkout/schemas";
import type { BankAccount } from "@/features/settings/schemas";
import { CheckoutSummary } from "./CheckoutSummary";
import { clearCheckoutToken, getCheckoutToken } from "./checkout-token";

const FORM_ID = "checkout-form";
const PAKISTAN = "PK";
const KARACHI = "Karachi";

type PaymentMethod = "bank_transfer" | "cod";

type FormState = {
  name: string;
  phone: string;
  email: string;
  country: string;
  cityChoice: "karachi" | "other";
  city: string;
  addressLine: string;
  postalCode: string;
  note: string;
  paymentMethod: PaymentMethod;
};

const SECTION = "border-border border-t pt-8";
const CHOICE = "min-w-28 border px-5 py-3 text-[11px] tracking-[0.22em] uppercase transition-colors duration-500";
const CHOICE_ON = "bg-espresso border-espresso text-background";
const CHOICE_OFF = "border-espresso/30 hover:border-espresso";

/**
 * The checkout (REQUIREMENTS SF-05): contact, address, payment and note on the left, the priced
 * summary on the right. Prices come from the cart quote; the order itself is placed by
 * `createOrderAction`, which prices everything again under lock (ARCHITECTURE.md §4.2).
 */
export function CheckoutForm({
  countries,
  defaultCountry,
  codEnabled,
  couponsEnabled,
  deliveryNote,
  bankAccounts,
}: {
  countries: CountryOption[];
  defaultCountry: string;
  codEnabled: boolean;
  couponsEnabled: boolean;
  deliveryNote: string;
  bankAccounts: BankAccount[];
}) {
  const router = useRouter();
  const { quote, status, pending, setCustomerPhone, refresh, clearCart } = useCart();
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    email: "",
    country: defaultCountry,
    cityChoice: "karachi",
    city: "",
    addressLine: "",
    postalCode: "",
    note: "",
    paymentMethod: "bank_transfer",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const placedRef = useRef(false);
  // The bank-transfer screenshot (owner decision, S8): uploaded before the order is placed, and
  // the goods total it was uploaded against, so a later change in the total can be pointed out.
  const [proof, setProof] = useState<{ token: string; goodsTotal: string } | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofPickerKey, setProofPickerKey] = useState(0);

  const isPakistan = form.country === PAKISTAN;
  const codOffered = codEnabled && isPakistan;
  const cityValue = isPakistan && form.cityChoice === "karachi" ? KARACHI : form.city;
  const isBankTransfer = form.paymentMethod === "bank_transfer";

  // An empty cart has nothing to check out; the order just placed empties it too, hence the ref.
  useEffect(() => {
    if (status === "ready" && !placedRef.current && (!quote || quote.lines.length === 0)) router.replace("/cart");
  }, [status, quote, router]);

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  function onCountryChange(country: string) {
    const nowPakistan = country === PAKISTAN;
    update({
      country,
      paymentMethod: !nowPakistan && form.paymentMethod === "cod" ? "bank_transfer" : form.paymentMethod,
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || submitting) return;
    setError(null);
    setFieldErrors({});

    const payload = {
      checkoutToken: getCheckoutToken(),
      name: form.name,
      phone: form.phone,
      email: form.email,
      country: form.country,
      city: cityValue,
      addressLine: form.addressLine,
      postalCode: form.postalCode,
      note: form.note,
      paymentMethod: form.paymentMethod,
      proofToken: isBankTransfer ? (proof?.token ?? null) : null,
      lines: quote.storedLines,
      couponCode: quote.storedCouponCode,
      expectedTotal: quote.expectedTotal,
    };

    // The same schema the server uses, so mistakes show at once without a round trip.
    const parsed = checkoutInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error));
      setError("Please check the highlighted fields.");
      return;
    }

    startSubmit(async () => {
      const result = await createOrderAction(payload);
      if (result.ok) {
        placedRef.current = true;
        clearCheckoutToken();
        clearCart();
        router.push(`/order/${result.orderNumber}`);
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      // An expired or missing upload: start the picker afresh with the reason under it.
      if (result.fieldErrors?.proofToken) {
        setProof(null);
        setProofError(result.fieldErrors.proofToken);
        setProofPickerKey((key) => key + 1);
      }
      // Stock, prices or the coupon may have moved: show the cart as the server now sees it.
      refresh();
    });
  }

  if (status === "loading" || !quote || quote.lines.length === 0) {
    return <p className="text-muted-foreground mt-12 text-sm">Loading your cart…</p>;
  }

  return (
    <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_420px] lg:gap-20">
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="grid gap-10">
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
              id="phone"
              label="Phone / WhatsApp"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              placeholder={isPakistan ? "03XX XXXXXXX" : "+44 7911 123456"}
              hint={isPakistan ? "We'll confirm your delivery charge on WhatsApp." : "Include your country code."}
              value={form.phone}
              onChange={(event) => update({ phone: event.target.value })}
              onBlur={() => setCustomerPhone(form.phone)}
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
          <p className="eyebrow">Delivery address</p>
          <SelectField
            id="country"
            label="Country"
            autoComplete="country"
            required
            value={form.country}
            onChange={(event) => onCountryChange(event.target.value)}
            error={fieldErrors.country}
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </SelectField>

          {isPakistan ? (
            <fieldset>
              <legend className="text-muted-foreground block text-[10px] tracking-[0.28em] uppercase">City</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["karachi", KARACHI],
                    ["other", "Other city"],
                  ] as const
                ).map(([choice, label]) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={form.cityChoice === choice}
                    onClick={() => update({ cityChoice: choice })}
                    className={`${CHOICE} ${form.cityChoice === choice ? CHOICE_ON : CHOICE_OFF}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.cityChoice === "other" && (
                <TextField
                  id="city"
                  label="City"
                  autoComplete="address-level2"
                  required
                  className="mt-6"
                  value={form.city}
                  onChange={(event) => update({ city: event.target.value })}
                  error={fieldErrors.city}
                />
              )}
            </fieldset>
          ) : (
            <TextField
              id="city"
              label="City"
              autoComplete="address-level2"
              required
              value={form.city}
              onChange={(event) => update({ city: event.target.value })}
              error={fieldErrors.city}
            />
          )}

          <TextField
            id="addressLine"
            label="Address"
            autoComplete="street-address"
            required
            placeholder="House, street, area"
            value={form.addressLine}
            onChange={(event) => update({ addressLine: event.target.value })}
            error={fieldErrors.addressLine}
          />
          <TextField
            id="postalCode"
            label="Postal code"
            autoComplete="postal-code"
            className="sm:max-w-xs"
            value={form.postalCode}
            onChange={(event) => update({ postalCode: event.target.value })}
            error={fieldErrors.postalCode}
          />
        </section>

        <section className={SECTION}>
          <fieldset>
            <legend className="eyebrow">Payment</legend>
            <div className="mt-6 grid gap-3">
              <PaymentChoice
                value="bank_transfer"
                title="Bank transfer"
                description="Transfer the products total to our account now and upload the screenshot below. The delivery charge is paid separately once confirmed."
                selected={form.paymentMethod === "bank_transfer"}
                onSelect={() => update({ paymentMethod: "bank_transfer" })}
              />
              {codOffered && (
                <PaymentChoice
                  value="cod"
                  title="Cash on delivery"
                  description="Pay in cash when your order arrives. Pakistan only."
                  selected={form.paymentMethod === "cod"}
                  onSelect={() => update({ paymentMethod: "cod" })}
                />
              )}
            </div>
            {fieldErrors.paymentMethod && (
              <p role="alert" className="text-destructive mt-3 text-xs">
                {fieldErrors.paymentMethod}
              </p>
            )}
          </fieldset>
          {isBankTransfer && (
            <div className="border-espresso/30 mt-4 grid gap-6 border-l-2 pl-5">
              <div>
                <p className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">Our bank details</p>
                <BankDetails accounts={bankAccounts} className="mt-4" />
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">Amount to transfer now</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2">
                  <p className="font-serif text-2xl">{quote.goodsTotal}</p>
                  <CopyButton value={quote.goodsTotal.replace(/\D/g, "")} label="Copy amount" />
                </div>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  The products total. The delivery charge is paid separately, once we confirm it with you on WhatsApp.
                </p>
              </div>
              <ProofUpload
                key={proofPickerKey}
                id="proofToken"
                endpoint="/api/checkout/proof"
                label="Payment screenshot"
                error={proofError}
                onChange={() => {
                  setProof(null);
                  setProofError(null);
                }}
                onUploaded={(body) => {
                  const token = (body as { token?: unknown }).token;
                  if (typeof token === "string") setProof({ token, goodsTotal: quote.goodsTotal });
                }}
              />
              {proof && proof.goodsTotal !== quote.goodsTotal && (
                <p role="status" className="border-champagne border-l-2 pl-4 text-xs leading-relaxed">
                  Your products total changed from {proof.goodsTotal} to {quote.goodsTotal} after you uploaded your screenshot. If
                  your transfer doesn&apos;t match the new amount, please upload a screenshot that does.
                </p>
              )}
            </div>
          )}
          <p className="text-muted-foreground mt-6 text-xs leading-relaxed">{deliveryNote}</p>
        </section>

        <section className={SECTION}>
          <TextAreaField
            id="note"
            label="Order note"
            placeholder="Anything we should know about your order or delivery"
            value={form.note}
            onChange={(event) => update({ note: event.target.value })}
            error={fieldErrors.note}
          />
        </section>
      </form>

      <CheckoutSummary
        quote={quote}
        pending={pending}
        submitting={submitting}
        couponsEnabled={couponsEnabled}
        deliveryNote={deliveryNote}
        formId={FORM_ID}
        error={error}
        blockedReason={isBankTransfer && !proof ? "Upload your payment screenshot to place your order." : null}
      />
    </div>
  );
}

function PaymentChoice({
  value,
  title,
  description,
  selected,
  onSelect,
}: {
  value: PaymentMethod;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-4 border px-5 py-4 transition-colors duration-500 has-[:focus-visible]:border-champagne ${
        selected ? "border-espresso bg-espresso/5" : "border-espresso/30 hover:border-espresso"
      }`}
    >
      <input type="radio" name="paymentMethod" value={value} checked={selected} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${selected ? "bg-espresso border-espresso" : "border-espresso/40"}`}
      />
      <span>
        <span className="block text-[11px] tracking-[0.22em] uppercase">{title}</span>
        <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">{description}</span>
      </span>
    </label>
  );
}
