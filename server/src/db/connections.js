const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Ensure database files directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbNames = ['users', 'community', 'knowledge', 'resources', 'guides', 'files', 'moderation'];
const connections = {};

dbNames.forEach((name) => {
  const dbPath = path.join(dataDir, `${name}.db`);
  const db = new Database(dbPath);

  // Set SQLite configuration
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Load and execute schema SQL
  const schemaPath = path.join(__dirname, 'schema', `${name}.sql`);
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  } else {
    console.warn(`Schema file not found for database: ${name}`);
  }

  connections[`${name}Db`] = db;
});

// Migrations: add new columns to existing databases (safe to run multiple times)
const migrations = [
  [connections.usersDb,      "ALTER TABLE users ADD COLUMN level_points INTEGER NOT NULL DEFAULT 0"],
  [connections.knowledgeDb,  "ALTER TABLE articles ADD COLUMN min_level INTEGER NOT NULL DEFAULT 1"],
  [connections.guidesDb,     "ALTER TABLE guides ADD COLUMN min_level INTEGER NOT NULL DEFAULT 1"],
  [connections.resourcesDb,  "ALTER TABLE research_websites ADD COLUMN min_level INTEGER NOT NULL DEFAULT 1"],
  [connections.filesDb,      "ALTER TABLE files ADD COLUMN refresh_failed_at TEXT"],
  [connections.filesDb,      "ALTER TABLE files ADD COLUMN is_dead INTEGER NOT NULL DEFAULT 0"],
];
for (const [db, sql] of migrations) {
  try { db.exec(sql); } catch (_) { /* column already exists */ }
}

module.exports = {
  usersDb: connections.usersDb,
  communityDb: connections.communityDb,
  knowledgeDb: connections.knowledgeDb,
  resourcesDb: connections.resourcesDb,
  guidesDb: connections.guidesDb,
  filesDb: connections.filesDb,
  moderationDb: connections.moderationDb
};
