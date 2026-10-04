import type { Metadata } from "next";
import { UsersPageBody } from "@/components/panel/users/UsersPageBody";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <UsersPageBody searchParams={await searchParams} />;
}
