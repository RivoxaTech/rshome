import { headers } from "next/headers";

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
