import Link from "next/link";

const TABS = [
  { key: "shop" as const, label: "Shop order" },
  { key: "featured" as const, label: "Featured order" },
];

function tabHref(tab: "shop" | "featured", category?: number): string {
  const search = new URLSearchParams();
  if (tab !== "shop") search.set("tab", tab);
  if (tab === "shop" && category) search.set("category", String(category));
  const query = search.toString();
  return query ? `/panel/products/arrange?${query}` : "/panel/products/arrange";
}

/** Two tabs, plain links (no client state) — switching loses the category filter, which only applies to Shop order. */
export function ArrangeTabs({ currentTab, category }: { currentTab: "shop" | "featured"; category?: number }) {
  return (
    <div className="border-border flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = tab.key === currentTab;
        return (
          <Link
            key={tab.key}
            href={tabHref(tab.key, category)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-primary text-foreground" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
