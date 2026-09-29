import { config } from "dotenv";
import path from "node:path";

// Runs before each test file's imports. Integration suites hit a database, and only ever the
// one named by TEST_DATABASE_URL (ARCHITECTURE.md §8): it replaces DATABASE_URL here, before
// src/server/env.ts reads it, so the app's own db client points at the test database. Without
// TEST_DATABASE_URL those suites skip themselves; the unit tests need no database at all.
config({ path: path.resolve(process.cwd(), ".env.local") });
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
