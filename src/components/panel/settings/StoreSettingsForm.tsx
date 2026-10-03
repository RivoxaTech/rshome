"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormNotice, inputClass } from "@/components/panel/FormField";
import { EmailListField } from "@/components/panel/settings/EmailListField";
import { useStaffAction } from "@/components/panel/use-staff-action";
import { MAX_NOTIFY_RECIPIENTS } from "@/features/settings/schemas";
import type { StaffActionResult } from "@/features/settings/staff-service";

export type StoreSettingsFormValues = {
  storeName: string;
  logoText: string;
  announcementText: string;
  facebook: string;
  instagram: string;
  instagramHandle: string;
  orderEmails: string[];
  wholesaleEmails: string[];
};

const ANNOUNCEMENT_MAX = 120;

/**
 * The Developer's store settings form (S14, `settings.manage`): one `<form>` saving every key in
 * one transaction. `version` is the concurrency token from the server page — after a save the
 * page refreshes and hands a new one down, so a second save isn't refused as stale. The two
 * "Send test email" forms come in through `testEmailSlot`, rendered *outside* this form (D49).
 */
export function StoreSettingsForm({
  initial,
  version,
  mailConfigured,
  action,
  testEmailSlot,
}: {
  initial: StoreSettingsFormValues;
  version: string;
  mailConfigured: boolean;
  action: (state: StaffActionResult | null, formData: FormData) => Promise<StaffActionResult>;
  testEmailSlot: React.ReactNode;
}) {
  const router = useRouter();
  // A successful save refreshes the server page (a new version token comes down as a prop; the
  // storefront's readers already see the rows) and the result itself drives the confirmation.
  const { state, formAction, pending } = useStaffAction(action, () => router.refresh());
  const [announcement, setAnnouncement] = useState(initial.announcementText);
  const [orderEmails, setOrderEmails] = useState(initial.orderEmails);
  const [wholesaleEmails, setWholesaleEmails] = useState(initial.wholesaleEmails);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !fieldErrors ? state.error : undefined;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form action={formAction} className="bg-card border-border flex flex-col gap-5 rounded-lg border p-4">
        <input type="hidden" name="version" value={version} />

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Identity</h2>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Field id="storeName" label="Store name" error={fieldErrors?.storeName} hint="Tab titles, emails, the footer copyright and WhatsApp messages.">
                <input id="storeName" name="storeName" defaultValue={initial.storeName} required maxLength={60} className={`${inputClass} w-full`} />
              </Field>
            </div>
            <div className="flex-1">
              <Field id="logoText" label="Logo text" error={fieldErrors?.logoText} hint="The wordmark in the header, footer and panel sidebar.">
                <input id="logoText" name="logoText" defaultValue={initial.logoText} required maxLength={40} className={`${inputClass} w-full`} />
              </Field>
            </div>
          </div>
          <Field
            id="announcementText"
            label="Announcement bar"
            error={fieldErrors?.announcementText}
            hint={`${announcement.trim().length}/${ANNOUNCEMENT_MAX}. Plain text, shown above the header on every page. Leave blank to hide the bar.`}
          >
            <input
              id="announcementText"
              name="announcementText"
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value)}
              maxLength={ANNOUNCEMENT_MAX}
              placeholder="Blank hides the bar"
              className={`${inputClass} w-full`}
            />
          </Field>
          {announcement.trim() ? (
            <div className="bg-espresso text-background overflow-hidden rounded-md px-3 py-2 text-center text-[10px] tracking-[0.3em] whitespace-nowrap uppercase" aria-label="Announcement bar preview">
              {announcement.trim()}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">The bar is hidden.</p>
          )}
        </section>

        <section className="border-border flex flex-col gap-4 border-t pt-5">
          <h2 className="text-sm font-semibold">Social links</h2>
          <Field id="facebook" label="Facebook" error={fieldErrors?.facebook} hint="A full https:// link, or blank to hide it in the footer.">
            <input id="facebook" name="facebook" type="url" defaultValue={initial.facebook} placeholder="https://www.facebook.com/…" className={`${inputClass} w-full`} />
          </Field>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Field id="instagram" label="Instagram" error={fieldErrors?.instagram} hint="A full https:// link, or blank to hide it.">
                <input id="instagram" name="instagram" type="url" defaultValue={initial.instagram} placeholder="https://www.instagram.com/…" className={`${inputClass} w-full`} />
              </Field>
            </div>
            <div className="flex-1">
              <Field id="instagramHandle" label="Instagram handle" error={fieldErrors?.instagramHandle} hint="The footer link's text, e.g. @reema_shamsi.">
                <input id="instagramHandle" name="instagramHandle" defaultValue={initial.instagramHandle} maxLength={50} className={`${inputClass} w-full`} />
              </Field>
            </div>
          </div>
        </section>

        <section className="border-border flex flex-col gap-4 border-t pt-5">
          <div>
            <h2 className="text-sm font-semibold">Owner email alerts</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Push notifications are the primary alert. An empty list means no email for that event. {mailConfigured ? "" : "No SMTP is configured on this server yet, so emails are only logged (development)."}
            </p>
          </div>
          <Field id="orderEmails" label="New order alerts" error={fieldErrors?.orderEmails}>
            <EmailListField id="orderEmails" name="orderEmails" value={orderEmails} onChange={setOrderEmails} max={MAX_NOTIFY_RECIPIENTS} error={fieldErrors?.orderEmails} emptyLabel="Off — no email alerts for new orders" />
          </Field>
          <Field id="wholesaleEmails" label="New wholesale inquiry alerts" error={fieldErrors?.wholesaleEmails}>
            <EmailListField
              id="wholesaleEmails"
              name="wholesaleEmails"
              value={wholesaleEmails}
              onChange={setWholesaleEmails}
              max={MAX_NOTIFY_RECIPIENTS}
              error={fieldErrors?.wholesaleEmails}
              emptyLabel="Off — no email alerts for wholesale inquiries"
            />
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
        {state?.ok && <FormNotice tone="success">Saved. The storefront shows the new values from its next page load.</FormNotice>}

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={pending} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* Sibling forms, never children of the save form above (D49). */}
      <div className="bg-card border-border flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Test the mailbox</h2>
        {testEmailSlot}
      </div>
    </div>
  );
}
