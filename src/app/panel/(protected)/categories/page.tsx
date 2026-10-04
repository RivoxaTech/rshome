import type { Metadata } from "next";
import { CategoriesPageBody } from "@/components/panel/categories/CategoriesPageBody";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CategoriesPageBody searchParams={await searchParams} />;
}
