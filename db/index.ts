import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_DIR = "./data";
const DB_PATH = process.env.DATABASE_URL ?? "./data/world.db";

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite, { schema });

// Run migrations on startup
export function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "db", "migrations");
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }
}
