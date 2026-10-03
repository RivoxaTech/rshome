import type { Metadata } from "next";
import { TrackForm } from "@/components/store/orders/TrackForm";
import { PageContainer } from "@/components/store/PageContainer";
import { orderNumberSchema } from "@/features/checkout/schemas";
import { noindexRobots } from "@/features/seo/metadata";

export const metadata: Metadata = { robots: noindexRobots };

/** `?order=` prefills the number when the order page sent the customer here for lack of a cookie. */
export default async function TrackPage({ searchParams }: PageProps<"/track">) {
  const raw = (await searchParams).order;
  const initial = orderNumberSchema.safeParse(Array.isArray(raw) ? raw[0] : raw);

  return (
    <PageContainer>
      <p className="eyebrow">Track</p>
      <h1 className="mt-3 font-serif text-4xl lg:text-6xl">Track Your Order</h1>
      <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed">
        Enter your order number and the phone number you used at checkout to see where your order is.
      </p>
      <TrackForm initialOrderNumber={initial.success ? initial.data : ""} />
    </PageContainer>
  );
}
