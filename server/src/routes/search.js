const express = require('express');
const { resourcesDb, knowledgeDb, guidesDb } = require('../db/connections');

const router = express.Router();

// Ensure search_analytics table exists
resourcesDb.exec(`
  CREATE TABLE IF NOT EXISTS search_analytics (
    term TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    last_searched_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

/**
 * GET /api/search/trending
 * Returns top 10 most searched terms. Falls back to popular content titles
 * when the analytics table has fewer than 10 entries.
 */
router.get('/trending', (req, res) => {
  try {
    const tracked = resourcesDb
      .prepare('SELECT term, count FROM search_analytics ORDER BY count DESC LIMIT 10')
      .all();

    if (tracked.length >= 10) {
      return res.status(200).json({ data: tracked });
    }

    // Supplement with published content titles as seed suggestions
    const trackedSet = new Set(tracked.map(t => t.term.toLowerCase()));
    const needed = 10 - tracked.length;

    const resourceTitles = resourcesDb
      .prepare(`SELECT name AS term FROM research_websites WHERE status = 'published' ORDER BY id DESC LIMIT ?`)
      .all(needed);

    const guideTitles = guidesDb
      .prepare(`SELECT title AS term FROM guides WHERE status = 'published' ORDER BY id DESC LIMIT ?`)
      .all(needed);

    const articleTitles = knowledgeDb
      .prepare(`SELECT title AS term FROM articles WHERE status = 'published' ORDER BY id DESC LIMIT ?`)
      .all(needed);

    const candidates = [...resourceTitles, ...guideTitles, ...articleTitles];
    const seen = new Set(trackedSet);
    const extra = [];
    for (const c of candidates) {
      if (extra.length >= needed) break;
      const key = c.term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        extra.push({ term: c.term, count: 0 });
      }
    }

    return res.status(200).json({ data: [...tracked, ...extra].slice(0, 10) });
  } catch (error) {
    console.error('Trending failed:', error.message);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch trending.' } });
  }
});

/**
 * GET /api/search/autocomplete?q=...
 * Returns title-only suggestions (fast, no content match)
 */
router.get('/autocomplete', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 1) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Query required.' } });
  }
  const like = `%${q}%`;
  try {
    const resources = resourcesDb.prepare(`
      SELECT id, name AS title, 'resource' AS type
      FROM research_websites
      WHERE status = 'published' AND name LIKE ?
      LIMIT 3
    `).all(like);

    const guides = guidesDb.prepare(`
      SELECT id, title, 'guide' AS type
      FROM guides
      WHERE status = 'published' AND title LIKE ?
      LIMIT 3
    `).all(like);

    const articles = knowledgeDb.prepare(`
      SELECT id, title, 'article' AS type
      FROM articles
      WHERE status = 'published' AND title LIKE ?
      LIMIT 4
    `).all(like);

    return res.status(200).json({ data: { resources, guides, articles } });
  } catch (error) {
    console.error('Autocomplete failed:', error.message);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Autocomplete failed.' } });
  }
});

/**
 * GET /api/search?q=...&limit=5
 * Global search across resources, guides, and knowledge articles
 */
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit || '5', 10), 20);

  if (!q || q.length < 2) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Query must be at least 2 characters.' } });
  }

  // Track search term in analytics (fire-and-forget, never block the response)
  try {
    resourcesDb.prepare(`
      INSERT INTO search_analytics (term, count, last_searched_at)
      VALUES (?, 1, datetime('now'))
      ON CONFLICT(term) DO UPDATE SET count = count + 1, last_searched_at = datetime('now')
    `).run(q.toLowerCase());
  } catch (_) {}

  const like = `%${q}%`;

  try {
    const resources = resourcesDb.prepare(`
      SELECT id, name AS title, COALESCE(short_description, '') AS description, 'resource' AS type
      FROM research_websites
      WHERE status = 'published' AND (name LIKE ? OR COALESCE(short_description, '') LIKE ?)
      LIMIT ?
    `).all(like, like, limit);

    const guides = guidesDb.prepare(`
      SELECT id, title, COALESCE(description, '') AS description, 'guide' AS type
      FROM guides
      WHERE status = 'published' AND (title LIKE ? OR COALESCE(description, '') LIKE ?)
      LIMIT ?
    `).all(like, like, limit);

    const articles = knowledgeDb.prepare(`
      SELECT a.id, a.title, '' AS description, 'article' AS type
      FROM articles a
      WHERE a.status = 'published' AND (a.title LIKE ? OR COALESCE(a.content, '') LIKE ?)
      LIMIT ?
    `).all(like, like, limit);

    return res.status(200).json({
      data: { resources, guides, articles },
      query: q
    });
  } catch (error) {
    console.error('Search failed:', error.message);
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Search failed.' } });
  }
});

module.exports = router;
