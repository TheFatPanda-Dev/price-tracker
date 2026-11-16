import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

const g = globalThis as unknown as { __ptDb?: DB };

function open(): DB {
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || "./data/price-tracker.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
  return db;
}

// Opened on first use (not at import) so `next build` never creates a database.
export const db = new Proxy({} as DB, {
  get(_, prop) {
    const real = (g.__ptDb ??= open());
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export { schema };
