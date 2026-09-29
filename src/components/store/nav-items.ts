export type StoreNavItem = {
  label: string;
  href: string;
};

/** REQUIREMENTS.md SF-01. Category hrefs match the seeded category slugs (DATABASE.md). */
export const STORE_NAV_ITEMS: StoreNavItem[] = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Tableware", href: "/category/tableware" },
  { label: "Tea Sets", href: "/category/tea-sets" },
  { label: "Trays", href: "/category/trays" },
  { label: "Decor", href: "/category/decor" },
  { label: "Wholesale", href: "/wholesale" },
];
