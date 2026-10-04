import type { Metadata } from "next";
import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { BankSettingsForm } from "@/components/panel/settings/BankSettingsForm";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getBankSettingsForEdit } from "@/features/settings/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { saveBankSettingsAction } from "@/app/panel/(protected)/settings/actions";

export const metadata: Metadata = { title: "Bank & contact" };

/** The Admin's bank, contact and WhatsApp details (REQUIREMENTS DV-07, `settings.bank` only). */
export default async function BankSettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_BANK);
  const data = await getBankSettingsForEdit();

  return (
    <>
      <PanelPageTitle title="Bank & contact" />
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">Bank &amp; contact</h1>
        <p className="text-muted-foreground text-sm">
          The account details customers transfer to at checkout, and the shop&apos;s phone, WhatsApp number and address shown across the store.
        </p>
      </div>
      <BankSettingsForm
        action={saveBankSettingsAction}
        initial={{
          accounts: data.accounts.map((account) => ({
            bankName: account.bankName,
            accountTitle: account.accountTitle,
            accountNumber: account.accountNumber,
            iban: account.iban ?? "",
            note: account.note ?? "",
          })),
          phone: data.contact.phone,
          whatsapp: data.contact.whatsapp,
          address: data.contact.address,
        }}
        version={data.version}
      />
    </>
  );
}
