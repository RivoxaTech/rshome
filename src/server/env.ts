import "./load-env";
import path from "node:path";
import { z } from "zod";

/** Payment proofs must survive a redeploy and never be reachable as static files (CLAUDE.md #8). */
function isOutsideAppFolder(dir: string): boolean {
  const relative = path.relative(process.cwd(), path.resolve(dir));
  return relative.startsWith("..") || path.isAbsolute(relative);
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
    .filter(Boolean)
    .map((origin) => new URL(origin).origin) ?? []),
];
