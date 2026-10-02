import { PanelFormHeader } from "@/components/panel/PanelFormHeader";

/** The back chevron + title row shared by the new/edit category pages. */
export function CategoryFormHeader({ title, backHref }: { title: string; backHref: string }) {
  return <PanelFormHeader title={title} backHref={backHref} backLabel="Back to categories" />;
}
