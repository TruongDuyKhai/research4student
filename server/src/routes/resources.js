const express = require('express');
const { resourcesDb } = require('../db/connections');
const { fileUrlById } = require('../services/discordStorage');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toJSON, fromJSON } = require('../utils/jsonField');
const { verifyToken } = require('../utils/jwt');
const usersModel = require('../models/usersModel');
const { getLevel } = require('../utils/levelSystem');

const router = express.Router();
const URL_REGEX = /^https?:\/\//i;

function parseOptionalAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;
  const token = authHeader.substring(7).trim();
  try {
    const decoded = verifyToken(token);
    if (decoded.id === 0 && decoded.role === 'admin') return { id: 0, role: 'admin' };
    const user = usersModel.findById(decoded.id);
    if (user && user.status !== 'banned') return user;
  } catch (_) {}
  return null;
}

/**
 * Helper to fetch complete website resource info with resolved file URLs and parsed arrays
 * @param {number} id
 * @returns {object|null}
 */
function getResourceDetail(id) {
  const item = resourcesDb.prepare('SELECT * FROM research_websites WHERE id = ?').get(id);
  if (!item) return null;

  const iconUrl = fileUrlById(item.icon_file_id);

  return {
    ...item,
    icon_url: iconUrl,
    target_audience: fromJSON(item.target_audience, []),
    features: fromJSON(item.features, [])
  };
}

/**
 * GET /api/resources
 * Public search and query list of published research websites
 */
router.get('/', (req, res) => {
  const { access_type, search } = req.query;

  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '10', 10);
  const offset = (page - 1) * limit;

  try {
    let baseQuery = `
      FROM research_websites rw
      WHERE rw.status = 'published'
    `;
    const params = [];

    if (access_type) {
      baseQuery += ` AND rw.access_type = ?`;
      params.push(access_type);
    }

    if (search) {
      baseQuery += ` AND rw.name LIKE ?`;
      params.push(`%${search}%`);
    }

    // Get total
    const totalRow = resourcesDb.prepare(`SELECT COUNT(*) AS total ` + baseQuery).get(...params);
    const total = totalRow ? totalRow.total : 0;

    // Get rows
    const queryParams = [...params, limit, offset];
    const list = resourcesDb.prepare(`
      SELECT rw.id, rw.name, rw.url, rw.short_description, rw.access_type, rw.min_level, rw.icon_file_id, rw.created_by
      ` + baseQuery + `
      ORDER BY rw.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams);

    const reqUser = parseOptionalAuth(req);
    const resUserLevel = (() => {
      if (!reqUser) return null;
      if (reqUser.role === 'admin' || reqUser.role === 'teacher') return 99;
      return getLevel(usersModel.findById(reqUser.id)?.level_points || 0);
    })();

    // Resolve icon_urls
    const formattedList = list.map(item => {
      const iconUrl = fileUrlById(item.icon_file_id);
      const minLevel = item.min_level != null ? item.min_level : 1;
      let locked = false;
      if (minLevel > 0 && resUserLevel === null) locked = true;
      else if (minLevel >= 2 && resUserLevel !== null && resUserLevel < minLevel) locked = true;
      return {
        id: item.id,
        name: item.name,
        url: item.url,
        short_description: item.short_description,
        access_type: item.access_type,
        min_level: minLevel,
        locked,
        icon_url: iconUrl,
        created_by: item.created_by
      };
    });

    return res.status(200).json({
      data: formattedList,
      pagination: {
        page,
        limit,
        total
      }
    });
  } catch (error) {
    console.error('Failed to get resources:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while listing research websites'
      }
    });
  }
});

/**
 * GET /api/resources/:id
 * Public detailed view of a research website
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;

  try {
    const detail = getResourceDetail(id);
    if (!detail || detail.status !== 'published') {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Research website not found'
        }
      });
    }

    return res.status(200).json({ data: detail });
  } catch (error) {
    console.error('Failed to get resource details:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while retrieving research website'
      }
    });
  }
});

/**
 * POST /api/resources
 * Admin/Teacher: Create a new research website entry
 */
router.post('/', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { name, url, short_description, full_description, access_type, icon_file_id, target_audience, features, min_level } = req.body;

  // Basic validation
  if (!name || !url || !access_type) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Name, URL, and access_type are required'
      }
    });
  }

  if (!URL_REGEX.test(url)) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'URL must start with http:// or https://'
      }
    });
  }

  if (!['free', 'paid'].includes(access_type)) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'access_type must be "free" or "paid"'
      }
    });
  }

  if (target_audience !== undefined) {
    if (!Array.isArray(target_audience) || target_audience.length > 10 || target_audience.some(x => typeof x !== 'string')) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'target_audience must be an array of strings, containing at most 10 items'
        }
      });
    }
  }

  if (features !== undefined) {
    if (!Array.isArray(features) || features.length > 10 || features.some(x => typeof x !== 'string')) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'features must be an array of strings, containing at most 10 items'
        }
      });
    }
  }

  const minLevelVal = Number.isInteger(min_level) && min_level >= 0 && min_level <= 5 ? min_level : 1;

  try {
    const info = resourcesDb.prepare(`
      INSERT INTO research_websites (
        created_by, name, url, short_description, full_description,
        access_type, min_level, icon_file_id, target_audience, features, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
    `).run(
      req.user.id,
      name,
      url,
      short_description || null,
      full_description || null,
      access_type,
      minLevelVal,
      icon_file_id || null,
      toJSON(target_audience || []),
      toJSON(features || [])
    );

    const created = getResourceDetail(info.lastInsertRowid);
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('Failed to create resource:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating research website'
      }
    });
  }
});

/**
 * PATCH /api/resources/:id
 * Admin/Teacher: Update a research website entry (owner or admin only)
 */
router.patch('/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;
  const { name, url, short_description, full_description, access_type, icon_file_id, target_audience, features, min_level } = req.body;

  try {
    const resource = resourcesDb.prepare('SELECT * FROM research_websites WHERE id = ?').get(id);
    if (!resource) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Research website not found'
        }
      });
    }

    // Authorization checks
    if (req.user.role !== 'admin' && resource.created_by !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to modify this resource'
        }
      });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (url !== undefined) {
      if (!URL_REGEX.test(url)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'URL must start with http:// or https://'
          }
        });
      }
      updates.push('url = ?');
      values.push(url);
    }

    if (short_description !== undefined) {
      updates.push('short_description = ?');
      values.push(short_description);
    }

    if (full_description !== undefined) {
      updates.push('full_description = ?');
      values.push(full_description);
    }

    if (access_type !== undefined) {
      if (!['free', 'paid'].includes(access_type)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'access_type must be "free" or "paid"'
          }
        });
      }
      updates.push('access_type = ?');
      values.push(access_type);
    }

    if (icon_file_id !== undefined) {
      updates.push('icon_file_id = ?');
      values.push(icon_file_id);
    }

    if (target_audience !== undefined) {
      if (!Array.isArray(target_audience) || target_audience.length > 10 || target_audience.some(x => typeof x !== 'string')) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'target_audience must be an array of strings, containing at most 10 items'
          }
        });
      }
      updates.push('target_audience = ?');
      values.push(toJSON(target_audience));
    }

    if (features !== undefined) {
      if (!Array.isArray(features) || features.length > 10 || features.some(x => typeof x !== 'string')) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'features must be an array of strings, containing at most 10 items'
          }
        });
      }
      updates.push('features = ?');
      values.push(toJSON(features));
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
      resourcesDb.prepare(`UPDATE research_websites SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = getResourceDetail(id);
    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error('Failed to update resource:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating research website'
      }
    });
  }
});

/**
 * DELETE /api/resources/:id
 * Admin/Teacher: Delete a research website entry (owner or admin only)
 */
router.delete('/:id', requireAuth, requireRole(['admin', 'teacher']), (req, res) => {
  const { id } = req.params;

  try {
    const resource = resourcesDb.prepare('SELECT * FROM research_websites WHERE id = ?').get(id);
    if (!resource) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Research website not found'
        }
      });
    }

    // Authorization checks
    if (req.user.role !== 'admin' && resource.created_by !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this resource'
        }
      });
    }

    resourcesDb.prepare('DELETE FROM research_websites WHERE id = ?').run(id);

    return res.status(200).json({
      data: {
        message: 'Research website deleted successfully'
      }
    });
  } catch (error) {
    console.error('Failed to delete resource:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while deleting research website'
      }
    });
  }
});

module.exports = router;
