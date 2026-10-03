import { PanelPageTitle } from "@/components/panel/PanelPageTitle";
import { StoreSettingsForm } from "@/components/panel/settings/StoreSettingsForm";
import { TestEmailButton } from "@/components/panel/settings/TestEmailButton";
import { PERMISSIONS } from "@/features/auth/permissions";
import { getStoreSettingsForEdit } from "@/features/settings/staff-service";
import { requirePermission } from "@/server/auth/permissions";
import { saveStoreSettingsAction } from "@/app/panel/(protected)/settings/actions";

/** The Developer's store settings (REQUIREMENTS DV-07, `settings.manage`): identity, announcement, social links, alert recipients. */
export default async function SettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const data = await getStoreSettingsForEdit();

  return (
    <>
      <PanelPageTitle title="Settings" />
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-semibold">Store settings</h1>
        <p className="text-muted-foreground text-sm">Name, announcement bar, social links and who gets the owner email alerts. Bank details, phone and address are on the Admin&apos;s Bank &amp; contact page.</p>
      </div>
      <StoreSettingsForm
        action={saveStoreSettingsAction}
        initial={{
          storeName: data.identity.storeName,
          logoText: data.identity.logoText,
          announcementText: data.announcementText,
          facebook: data.socialLinks.facebook,
          instagram: data.socialLinks.instagram,
          instagramHandle: data.socialLinks.instagramHandle,
          orderEmails: data.orderEmails,
          wholesaleEmails: data.wholesaleEmails,
        }}
        version={data.version}
        mailConfigured={data.mailConfigured}
        testEmailSlot={
          <div className="flex flex-col gap-3">
            <TestEmailButton list="order" label="Send test email to the order list" />
            <TestEmailButton list="wholesale" label="Send test email to the wholesale list" />
          </div>
        }
      />
    </>
  );
}
