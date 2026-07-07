const express = require('express');
const { knowledgeDb, filesDb } = require('../db/connections');
const { requireAuth, requireRole } = require('../middleware/auth');
const { verifyToken } = require('../utils/jwt');
const usersModel = require('../models/usersModel');
const { getLevel } = require('../utils/levelSystem');

const router = express.Router();
const SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * Helper to optionally parse a JWT from the request authorization headers.
 * Allows handling of hybrid public/private access routes like GET /articles.
 */
function parseOptionalAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  try {
    const decoded = verifyToken(token);
    if (decoded.id === 0 && decoded.role === 'admin') {
      return { id: 0, role: 'admin', username: 'admin' };
    }
    const user = usersModel.findById(decoded.id);
    if (user && user.status !== 'banned') {
      return user;
    }
  } catch (error) {
    // Ignore verification errors, treat request as guest
  }
  return null;
}

/* ==========================================
   SUBJECTS ENDPOINTS
   ========================================== */

/**
 * GET /api/knowledge/subjects
 * Public list of subjects with topicCount
 */
router.get('/subjects', (req, res) => {
  try {
    const subjects = knowledgeDb.prepare(`
      SELECT s.id, s.name, s.slug, s.created_at, COUNT(t.id) AS topicCount
      FROM subjects s
      LEFT JOIN topics t ON s.id = t.subject_id
      GROUP BY s.id
      ORDER BY s.name ASC
    `).all();

    return res.status(200).json({ data: subjects });
  } catch (error) {
    console.error('Failed to list subjects:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while listing subjects'
      }
    });
  }
});

/**
 * POST /api/knowledge/subjects
 * Admin/Teacher: Create a subject
 */
router.post('/subjects', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { name, slug } = req.body;

  if (!name || !slug || !SLUG_REGEX.test(slug)) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Name is required and slug must match format: lowercase, numbers, and dashes only'
      }
    });
  }

  try {
    const existing = knowledgeDb.prepare('SELECT id FROM subjects WHERE slug = ?').get(slug);
    if (existing) {
      return res.status(409).json({
        error: {
          code: 'UNIQUE_VIOLATION',
          message: 'Subject slug is already taken'
        }
      });
    }

    const info = knowledgeDb.prepare('INSERT INTO subjects (name, slug) VALUES (?, ?)').run(name, slug);
    const created = knowledgeDb.prepare('SELECT * FROM subjects WHERE id = ?').get(info.lastInsertRowid);

    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('Failed to create subject:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating subject'
      }
    });
  }
});

/**
 * PATCH /api/knowledge/subjects/:id
 * Admin/Teacher: Update a subject
 */
router.patch('/subjects/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;
  const { name, slug } = req.body;

  try {
    const subject = knowledgeDb.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
    if (!subject) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Subject not found'
        }
      });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (slug !== undefined) {
      if (!SLUG_REGEX.test(slug)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Slug must match format: lowercase, numbers, and dashes only'
          }
        });
      }

      const existing = knowledgeDb.prepare('SELECT id FROM subjects WHERE slug = ? AND id != ?').get(slug, id);
      if (existing) {
        return res.status(409).json({
          error: {
            code: 'UNIQUE_VIOLATION',
            message: 'Slug is already taken'
          }
        });
      }

      updates.push('slug = ?');
      values.push(slug);
    }

    if (updates.length > 0) {
      values.push(id);
      knowledgeDb.prepare(`UPDATE subjects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = knowledgeDb.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error('Failed to patch subject:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating subject'
      }
    });
  }
});

/**
 * DELETE /api/knowledge/subjects/:id
 * Admin/Teacher: Delete subject (cascades)
 */
router.delete('/subjects/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;

  try {
    const subject = knowledgeDb.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
    if (!subject) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Subject not found'
        }
      });
    }

    knowledgeDb.prepare('DELETE FROM subjects WHERE id = ?').run(id);

    return res.status(200).json({
      data: {
        message: 'Subject deleted successfully'
      }
    });
  } catch (error) {
    console.error('Failed to delete subject:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while deleting subject'
      }
    });
  }
});

/* ==========================================
   TOPICS ENDPOINTS
   ========================================== */

/**
 * GET /api/knowledge/subjects/:id/topics
 * Public: List topics belonging to a subject
 */
router.get('/subjects/:id/topics', (req, res) => {
  const { id } = req.params;

  try {
    const subject = knowledgeDb.prepare('SELECT * FROM subjects WHERE id = ?').get(id);
    if (!subject) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Subject not found'
        }
      });
    }

    const topics = knowledgeDb.prepare(`
      SELECT t.id, t.subject_id, t.name, t.slug, COUNT(a.id) AS articleCount
      FROM topics t
      LEFT JOIN articles a ON t.id = a.topic_id
      WHERE t.subject_id = ?
      GROUP BY t.id
      ORDER BY t.name ASC
    `).all(id);

    return res.status(200).json({ data: topics });
  } catch (error) {
    console.error('Failed to list topics:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while listing topics'
      }
    });
  }
});

/**
 * POST /api/knowledge/topics
 * Admin/Teacher: Create a topic
 */
router.post('/topics', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { subject_id, name, slug } = req.body;

  if (!subject_id || !name || !slug || !SLUG_REGEX.test(slug)) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Subject ID, name and valid slug format are required'
      }
    });
  }

  try {
    const subject = knowledgeDb.prepare('SELECT id FROM subjects WHERE id = ?').get(subject_id);
    if (!subject) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Parent Subject not found'
        }
      });
    }

    // Check unique (subject_id, slug)
    const existing = knowledgeDb.prepare('SELECT id FROM topics WHERE subject_id = ? AND slug = ?').get(subject_id, slug);
    if (existing) {
      return res.status(409).json({
        error: {
          code: 'UNIQUE_VIOLATION',
          message: 'Topic slug already exists in this subject'
        }
      });
    }

    const info = knowledgeDb.prepare('INSERT INTO topics (subject_id, name, slug) VALUES (?, ?, ?)').run(subject_id, name, slug);
    const created = knowledgeDb.prepare('SELECT * FROM topics WHERE id = ?').get(info.lastInsertRowid);

    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('Failed to create topic:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating topic'
      }
    });
  }
});

/**
 * PATCH /api/knowledge/topics/:id
 * Admin/Teacher: Update a topic
 */
router.patch('/topics/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;
  const { name, slug } = req.body;

  try {
    const topic = knowledgeDb.prepare('SELECT * FROM topics WHERE id = ?').get(id);
    if (!topic) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Topic not found'
        }
      });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (slug !== undefined) {
      if (!SLUG_REGEX.test(slug)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Slug must match format: lowercase, numbers, and dashes only'
          }
        });
      }

      // Check unique (subject_id, slug)
      const existing = knowledgeDb.prepare('SELECT id FROM topics WHERE subject_id = ? AND slug = ? AND id != ?').get(topic.subject_id, slug, id);
      if (existing) {
        return res.status(409).json({
          error: {
            code: 'UNIQUE_VIOLATION',
            message: 'Slug already exists in this subject'
          }
        });
      }

      updates.push('slug = ?');
      values.push(slug);
    }

    if (updates.length > 0) {
      values.push(id);
      knowledgeDb.prepare(`UPDATE topics SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = knowledgeDb.prepare('SELECT * FROM topics WHERE id = ?').get(id);
    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error('Failed to patch topic:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating topic'
      }
    });
  }
});

/**
 * DELETE /api/knowledge/topics/:id
 * Admin/Teacher: Delete topic (cascades)
 */
router.delete('/topics/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;

  try {
    const topic = knowledgeDb.prepare('SELECT * FROM topics WHERE id = ?').get(id);
    if (!topic) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Topic not found'
        }
      });
    }

    knowledgeDb.prepare('DELETE FROM topics WHERE id = ?').run(id);

    return res.status(200).json({
      data: {
        message: 'Topic deleted successfully'
      }
    });
  } catch (error) {
    console.error('Failed to delete topic:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while deleting topic'
      }
    });
  }
});

/* ==========================================
   ARTICLES ENDPOINTS
   ========================================== */

/**
 * GET /api/knowledge/articles
 * Public/Private articles lookup with paging, filters, and authorization check
 */
router.get('/articles', (req, res) => {
  const { topic_id, subject_id, status } = req.query;

  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '10', 10);
  const offset = (page - 1) * limit;

  const reqUser = parseOptionalAuth(req);

  try {
    let baseQuery = `
      FROM articles a
      LEFT JOIN topics t ON a.topic_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (topic_id) {
      baseQuery += ` AND a.topic_id = ?`;
      params.push(topic_id);
    } else if (subject_id) {
      baseQuery += ` AND t.subject_id = ?`;
      params.push(subject_id);
    }

    // Role-based visibility check
    if (reqUser && (reqUser.role === 'admin' || reqUser.role === 'teacher')) {
      if (status === 'draft') {
        if (reqUser.role === 'admin') {
          baseQuery += ` AND a.status = 'draft'`;
        } else {
          baseQuery += ` AND a.status = 'draft' AND a.author_id = ?`;
          params.push(reqUser.id);
        }
      } else if (!status) {
        if (reqUser.role === 'admin') {
          // Admin sees drafts and published
        } else {
          baseQuery += ` AND (a.status = 'published' OR (a.status = 'draft' AND a.author_id = ?))`;
          params.push(reqUser.id);
        }
      } else {
        baseQuery += ` AND a.status = 'published'`;
      }
    } else {
      baseQuery += ` AND a.status = 'published'`;
    }

    // Get total count
    const totalRow = knowledgeDb.prepare(`SELECT COUNT(*) AS total ` + baseQuery).get(...params);
    const total = totalRow ? totalRow.total : 0;

    // Get article rows
    const queryParams = [...params, limit, offset];
    const articles = knowledgeDb.prepare(`
      SELECT a.*, t.name AS topic_name, t.slug AS topic_slug
      ` + baseQuery + `
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams);

    // Determine requester level for locked flag
    const listUserLevel = (() => {
      if (!reqUser) return null; // not logged in
      if (reqUser.role === 'admin' || reqUser.role === 'teacher') return 99;
      return getLevel(usersModel.findById(reqUser.id)?.level_points || 0);
    })();

    // Map files cdn_urls and locked state
    const articlesWithFiles = articles.map(art => {
      let pdfUrl = null;
      if (art.pdf_file_id) {
        const file = filesDb.prepare('SELECT cdn_url FROM files WHERE id = ?').get(art.pdf_file_id);
        pdfUrl = file ? file.cdn_url : null;
      }
      const artMinLevel = art.min_level != null ? art.min_level : 1;
      let artLocked = false;
      if (artMinLevel > 0 && listUserLevel === null) artLocked = true;
      else if (artMinLevel >= 2 && listUserLevel !== null && listUserLevel < artMinLevel) artLocked = true;
      return {
        ...art,
        pdf_url: pdfUrl,
        locked: artLocked
      };
    });

    return res.status(200).json({
      data: articlesWithFiles,
      pagination: {
        page,
        limit,
        total
      }
    });
  } catch (error) {
    console.error('Failed to get articles list:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while listing articles'
      }
    });
  }
});

/**
 * GET /api/knowledge/articles/:id
 * Public detail lookup (drafts visible to author/admin only)
 */
router.get('/articles/:id', (req, res) => {
  const { id } = req.params;
  const reqUser = parseOptionalAuth(req);

  try {
    const article = knowledgeDb.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    if (!article) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Article not found'
        }
      });
    }

    // Verify draft permissions
    if (article.status === 'draft') {
      if (!reqUser || (reqUser.role !== 'admin' && article.author_id !== reqUser.id)) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied'
          }
        });
      }
    }

    // Level gating
    // min_level=0: public (no login needed)
    // min_level=1: requires login (any student)
    // min_level=2-5: requires accumulated level
    const minLevel = article.min_level != null ? article.min_level : 1;
    let locked = false;
    let lockReason = null;

    if (minLevel === 0) {
      locked = false; // always public
    } else if (!reqUser) {
      locked = true;
      lockReason = 'LOGIN_REQUIRED';
    } else if (reqUser.role !== 'admin' && reqUser.role !== 'teacher') {
      if (minLevel >= 2) {
        const userPoints = usersModel.findById(reqUser.id)?.level_points || 0;
        if (getLevel(userPoints) < minLevel) {
          locked = true;
          lockReason = 'LEVEL_REQUIRED';
        }
      }
    }

    // Fetch attachment file link
    let pdfUrl = null;
    let originalName = null;
    if (!locked && article.pdf_file_id) {
      const file = filesDb.prepare('SELECT cdn_url, original_name FROM files WHERE id = ?').get(article.pdf_file_id);
      if (file) {
        pdfUrl = file.cdn_url;
        originalName = file.original_name;
      }
    }

    const detailedArticle = {
      ...article,
      pdf_url: locked ? null : pdfUrl,
      pdf_name: locked ? null : originalName,
      content: locked ? null : article.content,
      locked,
      lock_reason: lockReason
    };

    return res.status(200).json({ data: detailedArticle });
  } catch (error) {
    console.error('Failed to retrieve article details:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while retrieving article'
      }
    });
  }
});

/**
 * POST /api/knowledge/articles
 * Admin/Teacher: Create a new article
 */
router.post('/articles', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { topic_id, title, content, pdf_file_id, status, min_level } = req.body;

  if (!topic_id || !title || !status || !['draft', 'published'].includes(status)) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Topic ID, title, and status ("draft" or "published") are required'
      }
    });
  }

  const minLevelVal = Number.isInteger(min_level) && min_level >= 0 && min_level <= 5 ? min_level : 1;

  try {
    const topic = knowledgeDb.prepare('SELECT id FROM topics WHERE id = ?').get(topic_id);
    if (!topic) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Topic not found'
        }
      });
    }

    const info = knowledgeDb.prepare(`
      INSERT INTO articles (topic_id, author_id, title, content, pdf_file_id, status, min_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(topic_id, req.user.id, title, content || null, pdf_file_id || null, status, minLevelVal);

    const created = knowledgeDb.prepare('SELECT * FROM articles WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('Failed to create article:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating article'
      }
    });
  }
});

/**
 * PATCH /api/knowledge/articles/:id
 * Admin/Teacher: Edit an article (author or admin only)
 */
router.patch('/articles/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;
  const { title, content, pdf_file_id, status, topic_id, min_level } = req.body;

  try {
    const article = knowledgeDb.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    if (!article) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Article not found'
        }
      });
    }

    // Permission enforcement
    if (req.user.role !== 'admin' && article.author_id !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to modify this article'
        }
      });
    }

    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }
    if (pdf_file_id !== undefined) {
      updates.push('pdf_file_id = ?');
      values.push(pdf_file_id);
    }
    if (status !== undefined) {
      if (!['draft', 'published'].includes(status)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Status must be "draft" or "published"'
          }
        });
      }
      updates.push('status = ?');
      values.push(status);
    }
    if (topic_id !== undefined) {
      const topic = knowledgeDb.prepare('SELECT id FROM topics WHERE id = ?').get(topic_id);
      if (!topic) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Target Topic not found'
          }
        });
      }
      updates.push('topic_id = ?');
      values.push(topic_id);
    }
    if (min_level !== undefined) {
      const lvl = parseInt(min_level, 10);
      if (!Number.isInteger(lvl) || lvl < 0 || lvl > 5) {
        return res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'min_level must be an integer between 0 and 5' }
        });
      }
      updates.push('min_level = ?');
      values.push(lvl);
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');
      values.push(id);
      knowledgeDb.prepare(`UPDATE articles SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = knowledgeDb.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error('Failed to update article:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating article'
      }
    });
  }
});

/**
 * DELETE /api/knowledge/articles/:id
 * Admin/Teacher: Delete an article (author or admin only)
 */
router.delete('/articles/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;

  try {
    const article = knowledgeDb.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    if (!article) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Article not found'
        }
      });
    }

    // Permission enforcement
    if (req.user.role !== 'admin' && article.author_id !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this article'
        }
      });
    }

    knowledgeDb.prepare('DELETE FROM articles WHERE id = ?').run(id);

    return res.status(200).json({
      data: {
        message: 'Article deleted successfully'
      }
    });
  } catch (error) {
    console.error('Failed to delete article:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while deleting article'
      }
    });
  }
});

module.exports = router;
