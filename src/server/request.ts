import { headers } from "next/headers";
import { allowedOrigins } from "@/server/env";

/**
 * CSRF guard for state-changing Route Handlers (ARCHITECTURE.md §4.5): Server Actions get
 * Next's own Origin check, Route Handlers call this. A missing Origin is refused too.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && allowedOrigins.includes(origin);
}

/** A file field of a multipart body, or null when the body or the field isn't one. */
export async function readFormFile(request: Request, field: string): Promise<File | null> {
  try {
    const value = (await request.formData()).get(field);
    return value instanceof File ? value : null;
  } catch {
    return null;
  }
}

/** The last X-Forwarded-For entry: the one appended by Apache/Passenger, closest to the truth. */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

export async function getUserAgent(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("user-agent") ?? "unknown";
}
