"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormNotice, inputClass } from "@/components/panel/FormField";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { BankDetails } from "@/components/store/orders/BankDetails";
import { Icon, ICON_PATHS } from "@/components/ui/Icon";
import { MAX_BANK_ACCOUNTS, bankAccountFieldName } from "@/features/settings/schemas";
import type { StaffActionResult } from "@/features/settings/staff-service";
import { normalizePhone } from "@/lib/phone";

type BankAccountFormValues = { bankName: string; accountTitle: string; accountNumber: string; iban: string; note: string };
type BankSettingsFormValues = { accounts: BankAccountFormValues[]; phone: string; whatsapp: string; address: string };

const EMPTY_ACCOUNT: BankAccountFormValues = { bankName: "", accountTitle: "", accountNumber: "", iban: "", note: "" };

/**
 * The Admin's bank/contact form (S14, `settings.bank`): the accounts post as indexed fields
 * (`account0BankName`, …, plus `accountCount`), contact fields by name, and `version` for the
 * stale-edit check. The preview on the right is the storefront's own `BankDetails` component fed
 * with the unsaved values, so what the Admin sees is exactly what a customer sees at checkout.
 */
export function BankSettingsForm({
  initial,
  version,
  action,
}: {
  initial: BankSettingsFormValues;
  version: string;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
}) {
  const router = useRouter();
  // A successful save refreshes the server page (a new version token comes down as a prop) and
  // the result itself drives the confirmation.
  const { state, formAction, pending } = useStaffAction(action, () => router.refresh());
  const [accounts, setAccounts] = useState<BankAccountFormValues[]>(initial.accounts.length > 0 ? initial.accounts : [EMPTY_ACCOUNT]);
  const [phone, setPhone] = useState(initial.phone);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;

  const updateAccount = (index: number, patch: Partial<BankAccountFormValues>) =>
    setAccounts((current) => current.map((account, i) => (i === index ? { ...account, ...patch } : account)));

  const whatsappDigits = normalizePhone(whatsapp);
  const previewAccounts = accounts.map((account) => ({
    bankName: account.bankName.trim() || "Bank",
    accountTitle: account.accountTitle.trim() || "Account title",
    accountNumber: account.accountNumber.trim() || "Account number",
    iban: account.iban.trim() || null,
    note: account.note.trim() || null,
  }));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <form action={formAction} className="bg-card border-border flex min-w-0 flex-1 flex-col gap-5 rounded-lg border p-4 lg:max-w-2xl">
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="accountCount" value={accounts.length} />

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Bank accounts</h2>
            <span className="text-muted-foreground text-xs">
              {accounts.length} of {MAX_BANK_ACCOUNTS}
            </span>
          </div>
          {fieldErrors?.accounts && <p className="text-destructive text-xs">{fieldErrors.accounts}</p>}

          {accounts.map((account, index) => (
            <fieldset key={index} className="border-border flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-xs font-medium">Account {index + 1}</legend>
                {accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAccounts((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove account ${index + 1}`}
                    className="text-destructive hover:bg-destructive/10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                  >
                    <Icon d={ICON_PATHS.trash} className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Field id={bankAccountFieldName(index, "BankName")} label="Bank" error={fieldErrors?.[bankAccountFieldName(index, "BankName")]}>
                    <input
                      id={bankAccountFieldName(index, "BankName")}
                      name={bankAccountFieldName(index, "BankName")}
                      value={account.bankName}
                      onChange={(event) => updateAccount(index, { bankName: event.target.value })}
                      required
                      maxLength={80}
                      className={`${inputClass} w-full`}
                    />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field id={bankAccountFieldName(index, "Title")} label="Account title" error={fieldErrors?.[bankAccountFieldName(index, "Title")]}>
                    <input
                      id={bankAccountFieldName(index, "Title")}
                      name={bankAccountFieldName(index, "Title")}
                      value={account.accountTitle}
                      onChange={(event) => updateAccount(index, { accountTitle: event.target.value })}
                      required
                      maxLength={120}
                      className={`${inputClass} w-full`}
                    />
                  </Field>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Field id={bankAccountFieldName(index, "Number")} label="Account number" error={fieldErrors?.[bankAccountFieldName(index, "Number")]} hint="Letters, numbers, spaces and dashes.">
                    <input
                      id={bankAccountFieldName(index, "Number")}
                      name={bankAccountFieldName(index, "Number")}
                      value={account.accountNumber}
                      onChange={(event) => updateAccount(index, { accountNumber: event.target.value })}
                      required
                      maxLength={40}
                      autoComplete="off"
                      className={`${inputClass} w-full font-mono`}
                    />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field id={bankAccountFieldName(index, "Iban")} label="IBAN" error={fieldErrors?.[bankAccountFieldName(index, "Iban")]} hint="Optional; international customers need it.">
                    <input
                      id={bankAccountFieldName(index, "Iban")}
                      name={bankAccountFieldName(index, "Iban")}
                      value={account.iban}
                      onChange={(event) => updateAccount(index, { iban: event.target.value })}
                      maxLength={40}
                      autoComplete="off"
                      className={`${inputClass} w-full font-mono`}
                    />
                  </Field>
                </div>
              </div>
              <Field id={bankAccountFieldName(index, "Note")} label="Note" error={fieldErrors?.[bankAccountFieldName(index, "Note")]} hint="Optional, shown under the account, e.g. which customers should use it.">
                <input
                  id={bankAccountFieldName(index, "Note")}
                  name={bankAccountFieldName(index, "Note")}
                  value={account.note}
                  onChange={(event) => updateAccount(index, { note: event.target.value })}
                  maxLength={200}
                  className={`${inputClass} w-full`}
                />
              </Field>
            </fieldset>
          ))}

          {accounts.length < MAX_BANK_ACCOUNTS && (
            <button type="button" onClick={() => setAccounts((current) => [...current, EMPTY_ACCOUNT])} className="border-input hover:bg-secondary w-fit rounded-md border px-3 py-1.5 text-xs font-medium">
              Add another account
            </button>
          )}
        </section>

        <section className="border-border flex flex-col gap-4 border-t pt-5">
          <h2 className="text-sm font-semibold">Contact</h2>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Field id="phone" label="Phone" error={fieldErrors?.phone} hint="Shown as typed in the footer and emails.">
                <input id="phone" name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={32} className={`${inputClass} w-full`} />
              </Field>
            </div>
            <div className="flex-1">
              <Field
                id="whatsapp"
                label="WhatsApp number"
                error={fieldErrors?.whatsapp}
                hint={whatsappDigits ? `Links open wa.me/${whatsappDigits}` : "Saved as digits with the country code, e.g. 923001234567."}
              >
                <input id="whatsapp" name="whatsapp" type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} required maxLength={32} className={`${inputClass} w-full`} />
              </Field>
            </div>
          </div>
          <Field id="address" label="Address" error={fieldErrors?.address} hint="The footer and emails.">
            <textarea id="address" name="address" defaultValue={initial.address} required maxLength={300} rows={2} className={`${inputClass} w-full resize-y`} />
          </Field>
        </section>

        {formError && (
          <FormNotice tone="error">
            {formError}{" "}
            <button type="button" onClick={() => window.location.reload()} className="font-medium underline underline-offset-2">
              Reload
            </button>
          </FormNotice>
        )}
        {state?.ok && <FormNotice tone="success">Saved. Checkout, the order page and the WhatsApp buttons show the new details from their next page load.</FormNotice>}

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* The customer's view, live from the unsaved fields (not a `<form>`, so it may sit anywhere). */}
      <aside className="bg-card border-border w-full rounded-lg border p-4 lg:sticky lg:top-0 lg:max-w-sm">
        <h2 className="text-sm font-semibold">Preview: what customers see at checkout</h2>
        <p className="text-muted-foreground mt-1 text-xs">Updates as you type. Saved values are what the store actually shows.</p>
        <div className="mt-4">
          <BankDetails accounts={previewAccounts} />
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          WhatsApp buttons open{" "}
          <span className="text-foreground font-mono">{whatsappDigits ? `wa.me/${whatsappDigits}` : "— enter a valid number —"}</span>
          {phone.trim() ? <>. The footer shows &ldquo;WhatsApp {phone.trim()}&rdquo;.</> : "."}
        </p>
      </aside>
    </div>
  );
}
