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
sqlite.pragma("journal_mode = WAL");

// Load sqlite-vec extension for vector search
try {
  // ESM import for sqlite-vec
  import("sqlite-vec").then(sqliteVec => {
    sqliteVec.load(sqlite);
    console.log("[DB] sqlite-vec extension loaded");
  }).catch(error => {
    console.error("[DB] sqlite-vec FAILED:", error);
    console.error("[DB] Vector search will not be available");
  });
} catch (error) {
  console.error("[DB] sqlite-vec FAILED:", error);
  console.error("[DB] Vector search will not be available");
}

export const db = drizzle(sqlite, { schema });

// Run migrations on startup
export function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "db", "migrations");
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }
}

// Ensure chronicles table exists (F1: Chronicle 编年史)
export function ensureChroniclesTable() {
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS chronicles (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        tick INTEGER NOT NULL,
        year INTEGER NOT NULL,
        season TEXT NOT NULL,
        day INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        agent_ids TEXT,
        building_ids TEXT,
        importance REAL DEFAULT 0.5,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);

    // Create index for common queries
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_chronicles_world ON chronicles(world_id)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_chronicles_tick ON chronicles(tick)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_chronicles_year ON chronicles(year)`);

    console.log("[DB] Chronicles table ready");
  } catch (error) {
    console.error("[DB] Failed to create chronicles table:", error);
  }
}

// Run on module load
ensureChroniclesTable();

// Ensure rumors table exists (F3: Rumor propagation)
function ensureRumorsTable() {
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS rumors (
        id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        originator_id TEXT,
        tick INTEGER NOT NULL,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        truth_level REAL DEFAULT 0.5,
        spread_count INTEGER DEFAULT 0,
        known_by_ids TEXT DEFAULT '[]',
        source_memory_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);

    // Create index for common queries
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_rumors_world ON rumors(world_id)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_rumors_tick ON rumors(tick)`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_rumors_spread ON rumors(spread_count)`);

    console.log("[DB] Rumors table ready");
  } catch (error) {
    console.error("[DB] Failed to create rumors table:", error);
  }
}

ensureRumorsTable();
