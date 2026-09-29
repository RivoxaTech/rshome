import "../src/server/load-env";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { env } from "../src/server/env";

const REQUIRED_COLLATION = "utf8mb4_unicode_ci";

interface SchemaRow extends mysql.RowDataPacket {
  collation: string;
}

interface CountRow extends mysql.RowDataPacket {
  tableCount: number;
}

/**
 * `--test` migrates TEST_DATABASE_URL instead (the integration tests' database, ARCHITECTURE.md
 * §8), creating it first if needed. Its name must end in `_test` so this can never touch the
 * real database.
 */
function resolveTarget(): { databaseUrl: string; createIfMissing: boolean } {
  if (!process.argv.includes("--test")) return { databaseUrl: env.DATABASE_URL, createIfMissing: false };

  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is not set. Check .env.local against .env.example.");
  if (!/_test$/.test(new URL(databaseUrl).pathname)) {
    throw new Error("TEST_DATABASE_URL must name a database ending in _test.");
  }
  return { databaseUrl, createIfMissing: true };
}

async function createDatabase(databaseUrl: string, databaseName: string) {
  const serverUrl = new URL(databaseUrl);
  serverUrl.pathname = "/";
  const connection = await mysql.createConnection({ uri: serverUrl.toString() });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE ${REQUIRED_COLLATION}`,
    );
  } finally {
    await connection.end();
  }
}

async function main() {
  const { databaseUrl, createIfMissing } = resolveTarget();
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!databaseName) {
    throw new Error("The database URL must include a database name.");
  }
  if (createIfMissing) await createDatabase(databaseUrl, databaseName);

  const connection = await mysql.createConnection({ uri: databaseUrl, multipleStatements: false });

  try {
    const [[schemaRow]] = await connection.query<SchemaRow[]>(
      "SELECT DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [databaseName],
    );
    if (!schemaRow) {
      throw new Error(`Database "${databaseName}" was not found.`);
    }

    if (schemaRow.collation !== REQUIRED_COLLATION) {
      const [[{ tableCount }]] = await connection.query<CountRow[]>(
        "SELECT COUNT(*) AS tableCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
        [databaseName],
      );

      if (tableCount > 0) {
        throw new Error(
          `Database "${databaseName}" has collation "${schemaRow.collation}" but already has ${tableCount} table(s). ` +
            `Refusing to migrate: fix the collation manually first (DB1 in docs/DATABASE.md), for example:\n` +
            `  ALTER DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE ${REQUIRED_COLLATION};`,
        );
      }

      console.log(
        `Setting database "${databaseName}" collation to ${REQUIRED_COLLATION} (was "${schemaRow.collation}")...`,
      );
      await connection.query(
        `ALTER DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE ${REQUIRED_COLLATION}`,
      );
    }

    const db = drizzle(connection);
    console.log(`Running migrations on "${databaseName}"...`);
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations complete.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
