import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/store/catalog/ProductGallery";
import { ProductPurchase } from "@/components/store/catalog/ProductPurchase";
import { PageContainer } from "@/components/store/PageContainer";
import { slugSchema } from "@/features/catalog/schemas";
import { getProductDetail } from "@/features/catalog/service";

/** An active product only; a draft, archived or unknown slug is a 404. */
export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const slug = slugSchema.safeParse((await params).slug);
  const product = slug.success ? await getProductDetail(slug.data) : null;
  if (!product) notFound();

  const crumbClass = "hover:text-champagne transition-colors";

  return (
    <PageContainer>
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

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-20">
        <ProductGallery images={product.images} name={product.name} />

        <div className="lg:pt-4">
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
