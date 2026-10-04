import { UsersPageBody } from "@/components/panel/users/UsersPageBody";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <UsersPageBody searchParams={await searchParams} />;
}
