const express = require('express');
const multer = require('multer');
const { usersDb } = require('../db/connections');
const usersModel = require('../models/usersModel');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadFile, fileUrlById } = require('../services/discordStorage');
const features = require('../config/features');

const router = express.Router();
const maxUploadSizeMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadSizeMb * 1024 * 1024
  }
}).single('file');

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

/**
 * Middleware to restrict action from Admin role since admin does not have a database profile record.
 */
const blockAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin role is not permitted to perform profile tasks'
      }
    });
  }
  next();
};

// GET /api/users/me
// Fetch authenticated user's profile
router.get('/me', requireAuth, blockAdmin, (req, res) => {
  const profile = usersModel.getFullUserProfile(req.user.id);
  if (!profile) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'User profile not found'
      }
    });
  }
  return res.status(200).json({ data: profile });
});

/**
 * PATCH /api/users/me
 * Update allowed profile fields based on role
 */
router.patch('/me', requireAuth, blockAdmin, (req, res) => {
  try {
    const { display_name, bio, language_pref, theme_pref } = req.body;

    if (req.user.role === 'teacher') {
      if (display_name !== undefined || bio !== undefined) {
        return res.status(422).json({
          error: {
            code: 'FIELD_LOCKED',
            message: 'Teachers are not permitted to change display name or bio'
          }
        });
      }
    }

    const updates = {};
    if (language_pref !== undefined) updates.language_pref = language_pref;
    if (theme_pref !== undefined) updates.theme_pref = theme_pref;

    if (req.user.role === 'student') {
      if (display_name !== undefined) updates.display_name = display_name;
      if (bio !== undefined) updates.bio = bio;
    }

    usersModel.updateUser(req.user.id, updates);

    const updatedProfile = usersModel.getFullUserProfile(req.user.id);
    return res.status(200).json({ data: updatedProfile });
  } catch (error) {
    console.error('Failed to update user profile:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating the profile'
      }
    });
  }
});

/**
 * PUT /api/users/me/username
 * Set username for student (one-time setup)
 */
router.put('/me/username', requireAuth, requireRole('student'), blockAdmin, (req, res) => {
  try {
    const { username } = req.body;

    if (!username || !USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Username must be 3-20 characters long and contain only lowercase letters, numbers, and underscores'
        }
      });
    }

    const currentUser = usersModel.findById(req.user.id);
    if (currentUser.username !== null) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Username has already been set and cannot be changed'
        }
      });
    }

    const existingUser = usersModel.findByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        error: {
          code: 'UNIQUE_VIOLATION',
          message: 'Username is already taken'
        }
      });
    }

    usersModel.updateUser(req.user.id, { username });

    const updatedProfile = usersModel.getFullUserProfile(req.user.id);
    return res.status(200).json({ data: updatedProfile });
  } catch (error) {
    console.error('Failed to set username:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while setting the username'
      }
    });
  }
});

/**
 * GET /api/users/check-username
 * Check if a username is valid and available (public)
 */
router.get('/check-username', (req, res) => {
  const { value } = req.query;

  if (!value || !USERNAME_REGEX.test(value)) {
    return res.status(200).json({
      data: { available: false }
    });
  }

  const existingUser = usersModel.findByUsername(value);
  return res.status(200).json({
    data: { available: !existingUser }
  });
});

/**
 * POST /api/users/me/avatar
 * Upload avatar image and reference it on user profile
 */
router.post('/me/avatar', requireAuth, blockAdmin, (req, res, next) => {
  if (!features.discordStorage) {
    return res.status(503).json({
      error: { code: 'FEATURE_DISABLED', message: 'File uploads are not configured on this server yet.' }
    });
  }
  upload(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Max ${maxUploadSizeMb}MB`
            }
          });
        }
        return res.status(400).json({
          error: {
            code: 'UPLOAD_ERROR',
            message: err.message
          }
        });
      }
      return next(err);
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'No file provided under field name "file"'
        }
      });
    }

    if (!IMAGE_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Avatar must be an image (PNG, JPEG, WEBP)'
        }
      });
    }

    try {
      const dbRecord = await uploadFile({
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
        purpose: 'avatar',
        uploaderId: req.user.id
      });

      usersModel.updateUser(req.user.id, { avatar_file_id: dbRecord.id });

      return res.status(200).json({
        data: {
          avatar_file_id: dbRecord.id,
          avatar_url: fileUrlById(dbRecord.id)
        }
      });
    } catch (uploadError) {
      console.error('Failed to upload avatar:', uploadError.message);
      return res.status(500).json({
        error: {
          code: 'UPLOAD_FAILED',
          message: 'Failed to upload avatar to Discord CDN'
        }
      });
    }
  });
});

/**
 * GET /api/users/:username
 * Fetch public user profile (public access, strips email)
 */
router.get('/:username', (req, res) => {
  const { username } = req.params;

  try {
    const profile = usersDb.prepare(`
      SELECT 
        u.username, u.display_name, u.bio, u.role, u.created_at, u.avatar_file_id,
        tp.department
      FROM users u
      LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
      WHERE u.username = ?
    `).get(username);

    if (!profile) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User profile not found'
        }
      });
    }

    profile.avatar_url = fileUrlById(profile.avatar_file_id);
    delete profile.avatar_file_id;

    if (profile.role !== 'teacher') {
      delete profile.department;
    }

    return res.status(200).json({
      data: profile
    });
  } catch (error) {
    console.error('Failed to retrieve user profile:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while retrieving the profile'
      }
    });
  }
});

module.exports = router;
