import { config } from "dotenv";
import path from "node:path";

// Next.js loads .env.local into the app itself. Scripts and drizzle.config.ts
// run outside Next, so they import this module first to get the same file.
// dotenv never overwrites a variable already set in process.env, so importing
// this from within the app (already loaded by Next) is a harmless no-op.
config({ path: path.resolve(process.cwd(), ".env.local") });
