import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/store/catalog/ProductGallery";
import { ProductPurchase } from "@/components/store/catalog/ProductPurchase";
import { PageContainer } from "@/components/store/PageContainer";
import { siteConfig } from "@/config/site.config";
import { slugSchema } from "@/features/catalog/schemas";
import { getProductDetail } from "@/features/catalog/service";
import { buildBreadcrumbJsonLd, buildProductJsonLd, serializeJsonLd } from "@/features/seo/jsonld";
import { buildStorefrontMetadata, canonicalUrl, mediaImageUrl } from "@/features/seo/metadata";
import { env } from "@/server/env";

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const slug = slugSchema.safeParse((await params).slug);
  const product = slug.success ? await getProductDetail(slug.data) : null;
  if (!product) notFound();

  const primaryImage = product.images[0];
  return buildStorefrontMetadata({
    appUrl: env.APP_URL,
    path: `/product/${slug.data}`,
    title: product.name,
    description: product.shortDescription || siteConfig.tagline,
    image: primaryImage ? mediaImageUrl(env.APP_URL, primaryImage.path) : undefined,
  });
}

/** An active product only; a draft, archived or unknown slug is a 404. */
export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const slug = slugSchema.safeParse((await params).slug);
  const product = slug.success ? await getProductDetail(slug.data) : null;
  if (!product) notFound();

  const productUrl = canonicalUrl(env.APP_URL, `/product/${slug.data}`);
  const productJsonLd = buildProductJsonLd({
    name: product.name,
    description: product.shortDescription,
    url: productUrl,
    images: product.images.map((image) => mediaImageUrl(env.APP_URL, image.path)),
    sku: product.seo.sku,
    price: product.seo.price,
    availability: product.seo.availability,
  });
  const breadcrumbItems = [{ name: "Shop", url: canonicalUrl(env.APP_URL, "/shop") }];
  if (product.category.isActive) {
    breadcrumbItems.push({ name: product.category.name, url: canonicalUrl(env.APP_URL, `/category/${product.category.slug}`) });
  }
  breadcrumbItems.push({ name: product.name, url: productUrl });
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbItems);

  const crumbClass = "hover:text-champagne transition-colors";

  return (
    <PageContainer>
      <script type="application/ld+json">{serializeJsonLd(productJsonLd)}</script>
      <script type="application/ld+json">{serializeJsonLd(breadcrumbJsonLd)}</script>
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-[10px] tracking-[0.28em] uppercase">
        <Link href="/shop" className={crumbClass}>
          Shop
        </Link>
        {product.category.isActive && (
          <>
            <span className="mx-3">/</span>
            <Link href={`/category/${product.category.slug}`} className={crumbClass}>
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 flex flex-col gap-10 lg:flex-row lg:items-stretch lg:gap-20">
        <ProductGallery images={product.images} name={product.name} />

        <div className="min-w-0 lg:flex-1 lg:pt-4">
          <h1 className="font-serif text-4xl leading-[1.05] lg:text-6xl">{product.name}</h1>
          {product.shortDescription && <p className="text-muted-foreground mt-3 text-sm">{product.shortDescription}</p>}

          <ProductPurchase optionName={product.optionName} variants={product.variants} />

          {product.description && (
            <div className="border-border mt-12 border-t pt-8">
              <p className="eyebrow">Details</p>
              <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
