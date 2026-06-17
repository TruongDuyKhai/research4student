const express = require('express');
const { resourcesDb, knowledgeDb, guidesDb } = require('../db/connections');

const router = express.Router();

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
