import { notFound } from "next/navigation";
import { PageBlocks } from "@/components/store/pages/PageBlocks";
import { PageContainer } from "@/components/store/PageContainer";
import { getPageBySlug } from "@/content/pages";
import { getContactInfo, getSocialLinks } from "@/features/settings/service";

/** Shared body for the five code-defined pages (`src/content/pages.ts`) — each route is a thin wrapper around this. */
export async function StaticPageView({ slug }: { slug: string }) {
  const page = getPageBySlug(slug);
  if (!page) notFound();

  const needsContact = page.blocks.some((block) => block.type === "contact");
  const [contact, socialLinks] = needsContact ? await Promise.all([getContactInfo(), getSocialLinks()]) : [null, null];

  return (
    <PageContainer>
      <PageBlocks blocks={page.blocks} contact={contact} socialLinks={socialLinks} />
    </PageContainer>
  );
}
