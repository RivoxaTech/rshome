import type { Metadata } from "next";
import { RolesPageBody } from "@/components/panel/roles/RolesPageBody";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return <RolesPageBody />;
}
