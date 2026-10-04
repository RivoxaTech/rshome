import type { Instrumentation } from "next";

/**
 * Every unhandled server error, logged once with the request that caused it (ARCHITECTURE.md §7:
 * `console.error` reaches Passenger's stderr log). No body, no headers, no cookies — only the
 * method, path and the error's message and digest, so the log never holds customer data.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  console.error(`[request error] ${request.method} ${request.path} (${context.routeType}${digest ? `, digest ${digest}` : ""}): ${message}`);
};
