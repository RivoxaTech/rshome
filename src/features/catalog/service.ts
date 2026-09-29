import { cache } from "react";
import { getActiveCategories, getFeaturedActiveProducts, getPrimaryImagesByProductId } from "@/features/catalog/repo";

export type HomeImage = { path: string; width: number; height: number; alt: string | null };

export type HomeCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imagePath: string | null;
};

export type HomeFeaturedProduct = {
  id: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  price: string;
  image: HomeImage | null;
};

// Server Components in the same request share these via React's cache() (ARCHITECTURE.md §5);
// pages render per request, so this never goes stale across a deploy or a settings change.
export const getHomeCategories = cache(async (): Promise<HomeCategory[]> => {
  const rows = await getActiveCategories();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imagePath: row.imagePath,
  }));
});

export const getHomeFeaturedProducts = cache(async (): Promise<HomeFeaturedProduct[]> => {
  const productRows = await getFeaturedActiveProducts();
  const images = await getPrimaryImagesByProductId(productRows.map((product) => product.id));

  return productRows.map((product) => {
    const image = images.get(product.id);
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      price: product.price,
      image: image ? { path: image.path, width: image.width, height: image.height, alt: image.alt } : null,
    };
  });
});
