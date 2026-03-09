import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');

// Ensure data directory exists for Cloud Run with mounted volume
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'prism.db');
export const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL,
    brand_voice TEXT NOT NULL DEFAULT 'Professional & Creative',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    type       TEXT    NOT NULL CHECK(type IN ('image','video')),
    url        TEXT    NOT NULL,
    prompt     TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS storyboards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title      TEXT    NOT NULL,
    brand_voice TEXT NOT NULL DEFAULT 'Professional & Creative',
    parts      TEXT    NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

console.log(`[DB] SQLite database initialized at: ${dbPath}`);
