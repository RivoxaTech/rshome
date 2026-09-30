import { cookies } from "next/headers";
import { PANEL_THEME_COOKIE, type PanelTheme } from "@/components/panel/theme";

export async function readPanelTheme(): Promise<PanelTheme> {
  return (await cookies()).get(PANEL_THEME_COOKIE)?.value === "dark" ? "dark" : "light";
}
