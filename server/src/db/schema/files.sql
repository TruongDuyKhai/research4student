CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uploader_id INTEGER NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  purpose TEXT NOT NULL,
  discord_message_id TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  cdn_url TEXT NOT NULL,
  cdn_url_expires_at TEXT,
  last_refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
  refresh_failed_at TEXT,
  is_dead INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
