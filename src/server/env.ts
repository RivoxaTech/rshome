import "./load-env";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((v) => v.startsWith("mysql://"), "DATABASE_URL must be a mysql:// connection string"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  UPLOAD_DIR: z.string().min(1),
  APP_URL: z.url(),
  ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables. Check .env.local against .env.example.");
}

export const env = parsed.data;

/** Origins allowed for state-changing requests: APP_URL plus any extra tunnel/demo hosts. */
export const allowedOrigins = [
  new URL(env.APP_URL).origin,
  ...(env.ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []),
];
