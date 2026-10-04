/**
 * Pure JSON-LD builders (ARCHITECTURE.md D7/§4: no DB here, callers pass already-loaded data).
 * Rendered into the page as `<script type="application/ld+json">{serializeJsonLd(data)}</script>` —
 * a plain text child, never `dangerouslySetInnerHTML` (CLAUDE.md's standing rule): React inserts a
 * string child as a text node, which the HTML parser treats as inert `<script>` content rather than
 * markup, so `serializeJsonLd`'s `<` escaping only has to guard against a literal `</script>`
 * breaking out of the tag, not against React re-parsing anything as HTML.
 */
export type JsonLdAvailability = "InStock" | "OutOfStock" | "LimitedAvailability";
/** Mirrors `features/catalog/service.ts#StockState`, duplicated here to keep this module dependency-free. */
type StockState = "in_stock" | "low_stock" | "sold_out";

/** `JSON.stringify` with `<` escaped to `<`, so a store/product name can never close the `<script>` tag early. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** A sold-out variant has none to sell; a low-stock one is still buyable but may run out soon. */
export function productAvailability(stockState: StockState): JsonLdAvailability {
  switch (stockState) {
    case "sold_out":
      return "OutOfStock";
    case "low_stock":
      return "LimitedAvailability";
    case "in_stock":
      return "InStock";
  }
}

type ProductJsonLdInput = {
  name: string;
  description: string | null;
  url: string;
  images: string[];
  sku: string;
  /** A PKR decimal string, e.g. "4500.00" (features/pricing/money.ts#paisaToDecimal). */
  price: string;
  availability: JsonLdAvailability;
};

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.images.length > 0 ? { image: input.images } : {}),
    sku: input.sku,
    url: input.url,
    offers: {
      "@type": "Offer",
      url: input.url,
      priceCurrency: "PKR",
      price: input.price,
      availability: `https://schema.org/${input.availability}`,
    },
  };
}

type BreadcrumbItem = { name: string; url: string };

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

type OrganizationJsonLdInput = {
  name: string;
  url: string;
  telephone: string | null;
  /** Non-blank social links only — a blank one isn't a real profile to cite. */
  sameAs: string[];
};

export function buildOrganizationJsonLd(input: OrganizationJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: input.url,
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.sameAs.length > 0 ? { sameAs: input.sameAs } : {}),
  };
}
