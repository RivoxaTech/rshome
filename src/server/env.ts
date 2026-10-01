import "./load-env";
import path from "node:path";
import { z } from "zod";

/** Payment proofs must survive a redeploy and never be reachable as static files (CLAUDE.md #8). */
function isOutsideAppFolder(dir: string): boolean {
  const relative = path.relative(process.cwd(), path.resolve(dir));
  return relative.startsWith("..") || path.isAbsolute(relative);
}

/** An optional var left blank (rather than unset) in a host's env UI reads the same as missing. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const envSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((v) => v.startsWith("mysql://"), "DATABASE_URL must be a mysql:// connection string"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  UPLOAD_DIR: z
    .string()
    .min(1)
    .refine((dir) => path.isAbsolute(dir), "UPLOAD_DIR must be an absolute path")
    .refine(isOutsideAppFolder, "UPLOAD_DIR must be outside the app folder"),
  APP_URL: z.url(),
  ALLOWED_ORIGINS: z.string().optional(),
  // S21: web-push. Optional in development; required in production (checked below) since the
  // production private key must never change once a device has subscribed against it, or every
  // existing subscription breaks.
  VAPID_PUBLIC_KEY: optional(z.string().min(1)),
  VAPID_PRIVATE_KEY: optional(z.string().min(1)),
  VAPID_SUBJECT: optional(z.string().refine((value) => value.startsWith("mailto:"), "VAPID_SUBJECT must start with mailto:")),
  // S21: SMTP. Optional in development, where a missing config just logs the email instead of
  // sending it; required in production (checked below).
  SMTP_HOST: optional(z.string().min(1)),
  SMTP_PORT: optional(z.coerce.number().int().positive()),
  SMTP_USER: optional(z.string().min(1)),
  SMTP_PASS: optional(z.string().min(1)),
  MAIL_FROM: optional(z.email()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables. Check .env.local against .env.example.");
}

export const env = parsed.data;

/** web-push and SMTP are optional in development but required in production (BUILD_PLAN.md C26). */
const PRODUCTION_REQUIRED = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
] as const satisfies (keyof typeof env)[];

if (process.env.NODE_ENV === "production") {
  const missing = PRODUCTION_REQUIRED.filter((key) => env[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}. Check .env.local against .env.example.`);
  }
}

/** Origins allowed for state-changing requests: APP_URL plus any extra tunnel/demo hosts. */
export const allowedOrigins = [
  new URL(env.APP_URL).origin,
  ...(env.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin) ?? []),
];
