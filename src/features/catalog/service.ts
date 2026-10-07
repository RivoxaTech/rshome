import { cache } from "react";
import {
  getActiveListingProducts,
  getActiveProductBySlug,
  getActiveProductsForSitemap,
  getActiveVariantsByProductIds,
  getFeaturedActiveProducts,
  getPrimaryImagesByProductId,
  getProductImages,
  listAllCategories,
  type ListingProductRow,
  type ProductImageRow,
  type VariantRow,
} from "@/features/catalog/repo";
import { paginate, sortProducts, type ShopSort } from "@/features/catalog/listing";
import { parseVariantAttributes } from "@/features/catalog/variants";
import { visibleCategoryIds } from "@/features/catalog/visibility";
import { toDisplayPrice, type DisplayPrice } from "@/features/pricing/display";
import { decimalToPaisa, paisaToDecimal, type Paisa } from "@/features/pricing/money";
import type { PricingProduct, VariantPrice } from "@/features/pricing/pricing";
import { getVariantPricer, type VariantPricer } from "@/features/pricing/service";
import { productAvailability, type JsonLdAvailability } from "@/features/seo/jsonld";

const SHOP_PAGE_SIZE = 12;
/** At or below this many units a variant shows "Only N left". */
const LOW_STOCK_THRESHOLD = 5;

export type ProductImage = { path: string; width: number; height: number; alt: string | null };

export type StoreCategory = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  description: string | null;
  imagePath: string | null;
  /** Whether the home page gives this category its own story section (D64). */
  showOnHomepage: boolean;
};

export type ProductCard = {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  image: ProductImage | null;
  /** The cheapest active variant's price. */
  price: DisplayPrice;
  /** True when variants have different prices, so the card reads "From PKR …". */
  priceFrom: boolean;
  /** The one variant a card can add directly; null when the customer must choose options first. */
  singleVariant: { id: number; soldOut: boolean } | null;
};

type StockState = "in_stock" | "low_stock" | "sold_out";

export type VariantOption = {
  id: number;
  label: string;
  price: DisplayPrice;
  stock: number;
  stockState: StockState;
};

/** The data a Product JSON-LD block needs (features/seo/jsonld.ts), from the cheapest active variant. */
type ProductSeoFacts = { sku: string; price: string; availability: JsonLdAvailability };

type ProductDetail = {
  id: number;
  name: string;
  shortDescription: string | null;
  description: string | null;
  category: { name: string; slug: string; isActive: boolean };
  images: ProductImage[];
  /** The picker heading, e.g. "Size", when every variant varies by the same single attribute. */
  optionName: string;
  variants: VariantOption[];
  seo: ProductSeoFacts;
};

function toImage(row: ProductImageRow): ProductImage {
  return { path: row.path, width: row.width, height: row.height, alt: row.alt };
}

function toPricingProduct(row: { id: number; price: string; categoryId: number; parentCategoryId: number | null }): PricingProduct {
  return { id: row.id, price: decimalToPaisa(row.price), categoryId: row.categoryId, parentCategoryId: row.parentCategoryId };
}

function priceOf(pricer: VariantPricer, product: PricingProduct, variant: VariantRow): VariantPrice {
  return pricer(product, variant.priceOverride === null ? null : decimalToPaisa(variant.priceOverride));
}

function stockStateOf(stock: number): StockState {
  if (stock <= 0) return "sold_out";
  return stock <= LOW_STOCK_THRESHOLD ? "low_stock" : "in_stock";
}

// Server Components in the same request share these via React's cache() (ARCHITECTURE.md §5);
// pages render per request, so this never goes stale across a deploy or a settings change.
/**
 * Only the categories the storefront should show: a hidden category disappears, and so does an
 * otherwise-active child of a hidden parent (S10, one level of nesting) — the rule lives
 * in `visibleCategoryIds` (pure, unit-tested) and is applied once here rather than per component.
 */
export const getStoreCategories = cache(async (): Promise<StoreCategory[]> => {
  const rows = await listAllCategories();
  const visible = visibleCategoryIds(rows);
  return rows
    .filter((row) => visible.has(row.id))
    .map((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imagePath: row.imagePath,
      showOnHomepage: row.showOnHomepage,
    }));
});

export async function getCategoryBySlug(slug: string): Promise<StoreCategory | null> {
  const categories = await getStoreCategories();
  return categories.find((category) => category.slug === slug) ?? null;
}

/** The visible categories' ids, for filtering product listings/details by the same rule. */
const getVisibleCategoryIds = cache(async (): Promise<Set<number>> => {
  return new Set((await getStoreCategories()).map((category) => category.id));
});

type PricedListingProduct = {
  row: ListingProductRow;
  id: number;
  createdAt: Date;
  fromPrice: Paisa;
  sortOrder: number;
  cheapest: VariantPrice;
  priceFrom: boolean;
  singleVariant: ProductCard["singleVariant"];
};

/**
 * Prices every active variant; a product with no active variant has nothing to sell and is
 * dropped. Also drops a product whose category (or whose category's parent) is hidden — the
 * single choke point both the shop grid and the home page's featured list pass through, so the
 * active-category rule only has to be applied once (S10).
 */
async function priceListingProducts(rows: ListingProductRow[]): Promise<PricedListingProduct[]> {
  const [pricer, visibleIds] = await Promise.all([getVariantPricer(), getVisibleCategoryIds()]);
  const visibleRows = rows.filter((row) => visibleIds.has(row.categoryId));
  const variants = await getActiveVariantsByProductIds(visibleRows.map((row) => row.id));

  const variantsByProduct = new Map<number, VariantRow[]>();
  for (const variant of variants) {
    variantsByProduct.set(variant.productId, [...(variantsByProduct.get(variant.productId) ?? []), variant]);
  }

  return visibleRows.flatMap((row) => {
    const product = toPricingProduct(row);
    const productVariants = variantsByProduct.get(row.id) ?? [];
    const prices = productVariants.map((variant) => priceOf(pricer, product, variant));
    if (prices.length === 0) return [];

    const cheapest = prices.reduce((best, price) => (price.unitPrice < best.unitPrice ? price : best));
    const priceFrom = prices.some((price) => price.unitPrice !== cheapest.unitPrice);
    const singleVariant =
      productVariants.length === 1 ? { id: productVariants[0].id, soldOut: productVariants[0].stock <= 0 } : null;
    return [{ row, id: row.id, createdAt: row.createdAt, fromPrice: cheapest.unitPrice, sortOrder: row.sortOrder, cheapest, priceFrom, singleVariant }];
  });
}

async function toCards(items: PricedListingProduct[]): Promise<ProductCard[]> {
  const images = await getPrimaryImagesByProductId(items.map((item) => item.id));
  return items.map(({ row, cheapest, priceFrom, singleVariant }) => {
    const image = images.get(row.id);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      image: image ? toImage(image) : null,
      price: toDisplayPrice(cheapest),
      priceFrom,
      singleVariant,
    };
  });
}

export const getHomeFeaturedProducts = cache(async (): Promise<ProductCard[]> => {
  return toCards(await priceListingProducts(await getFeaturedActiveProducts()));
});

export type ProductListing = { cards: ProductCard[]; page: number; totalPages: number; totalCount: number };

/**
 * One page of the shop grid. Sorting is by the price the card shows (after discounts), which is
 * computed in features/pricing, so the filtered set is priced and sorted here and only the page's
 * images are loaded (ARCHITECTURE.md D27).
 */
export async function listProducts(options: {
  category: StoreCategory | null;
  nameQuery: string | null;
  sort: ShopSort;
  page: number;
}): Promise<ProductListing> {
  const { category } = options;
  let categoryIds: number[] | null = null;
  if (category) {
    const children = (await getStoreCategories()).filter((child) => child.parentId === category.id);
    categoryIds = [category.id, ...children.map((child) => child.id)];
  }

  const rows = await getActiveListingProducts({ categoryIds, nameQuery: options.nameQuery });
  const sorted = sortProducts(await priceListingProducts(rows), options.sort);
  const { page, totalPages, offset } = paginate(sorted.length, options.page, SHOP_PAGE_SIZE);

  return {
    cards: await toCards(sorted.slice(offset, offset + SHOP_PAGE_SIZE)),
    page,
    totalPages,
    totalCount: sorted.length,
  };
}

/** "Size" when every variant has exactly one attribute and it's the same one; otherwise "Option". */
function optionNameOf(variants: VariantRow[]): string {
  const keys = new Set<string>();
  for (const variant of variants) {
    const variantKeys = Object.keys(parseVariantAttributes(variant.attributes));
    if (variantKeys.length !== 1) return "Option";
    keys.add(variantKeys[0]);
  }
  return keys.size === 1 ? [...keys][0] : "Option";
}

/** An active product with at least one active variant, every variant priced; null means 404. */
export const getProductDetail = cache(async (slug: string): Promise<ProductDetail | null> => {
  const product = await getActiveProductBySlug(slug);
  if (!product) return null;

  const [variants, images, pricer, visibleIds] = await Promise.all([
    getActiveVariantsByProductIds([product.id]),
    getProductImages(product.id),
    getVariantPricer(),
    getVisibleCategoryIds(),
  ]);
  if (variants.length === 0) return null;

  const pricingProduct = toPricingProduct(product);
  const pricedVariants = variants.map((variant) => ({ variant, priced: priceOf(pricer, pricingProduct, variant) }));
  // Same "cheapest active variant" rule priceListingProducts uses for cards: one representative
  // price/stock for the Product JSON-LD's single Offer, not an AggregateOffer per variant.
  const cheapest = pricedVariants.reduce((best, current) => (current.priced.unitPrice < best.priced.unitPrice ? current : best));

  return {
    id: product.id,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    category: { name: product.categoryName, slug: product.categorySlug, isActive: visibleIds.has(product.categoryId) },
    images: images.map(toImage),
    optionName: optionNameOf(variants),
    variants: pricedVariants.map(({ variant, priced }) => ({
      id: variant.id,
      label: variant.label,
      price: toDisplayPrice(priced),
      stock: variant.stock,
      stockState: stockStateOf(variant.stock),
    })),
    seo: {
      sku: cheapest.variant.sku,
      price: paisaToDecimal(cheapest.priced.unitPrice),
      availability: productAvailability(stockStateOf(cheapest.variant.stock)),
    },
  };
});

type SitemapProductEntry = { slug: string; updatedAt: Date };

/** Active products in a visible category, for `app/sitemap.ts` — slug and last-updated time only. */
export const getSitemapProducts = cache(async (): Promise<SitemapProductEntry[]> => {
  const [rows, visibleIds] = await Promise.all([getActiveProductsForSitemap(), getVisibleCategoryIds()]);
  return rows.filter((row) => visibleIds.has(row.categoryId)).map((row) => ({ slug: row.slug, updatedAt: row.updatedAt }));
});
