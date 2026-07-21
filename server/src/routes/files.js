const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { uploadFile, getFileById, getFreshCdnUrl, fileUrlById } = require('../services/discordStorage');
const features = require('../config/features');

const router = express.Router();
const maxUploadSizeMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadSizeMb * 1024 * 1024
  }
}).single('file');

const VALID_PURPOSES = ['avatar', 'post_attachment', 'article_pdf', 'guide_doc', 'resource_icon'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PDF_TYPES = ['application/pdf'];

/**
 * POST /api/files/upload
 * Protect route with authentication, accept a single file upload, validate size, mimetype, and purpose.
 */
router.post('/upload', requireAuth, (req, res, next) => {
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

    const { purpose } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'No file provided under field name "file"'
        }
      });
    }

    if (!purpose || !VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: `Invalid or missing purpose. Must be one of: ${VALID_PURPOSES.join(', ')}`
        }
      });
    }

    // Validate mime types matching upload purposes
    let isValidType = false;
    if (['avatar', 'resource_icon', 'post_attachment'].includes(purpose)) {
      isValidType = IMAGE_TYPES.includes(file.mimetype);
    } else if (['article_pdf', 'guide_doc'].includes(purpose)) {
      isValidType = PDF_TYPES.includes(file.mimetype);
    }

    if (!isValidType) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILE_TYPE',
          message: `Mime type "${file.mimetype}" is not permitted for purpose "${purpose}".`
        }
      });
    }

    try {
      const dbRecord = await uploadFile({
        buffer: file.buffer,
        filename: file.originalname,
        mimetype: file.mimetype,
        purpose,
        uploaderId: req.user.id
      });

      return res.status(201).json({
        data: {
          ...dbRecord,
          // Hand back the stable proxy URL, never the signed Discord one.
          cdn_url: fileUrlById(dbRecord.id)
        }
      });
    } catch (uploadError) {
      console.error('Discord storage upload failure:', uploadError.message);
      return res.status(500).json({
        error: {
          code: 'UPLOAD_FAILED',
          message: 'Failed to upload file to Discord CDN storage'
        }
      });
    }
  });
});

/**
 * GET /api/files/:id/raw
 * Permanent URL for a stored file. Resolves a currently valid Discord CDN URL
 * (re-signing on demand) and redirects to it, so pages can embed this address
 * indefinitely without ever holding an expired Discord signature.
 */
router.get('/:id/raw', async (req, res) => {
  const { id } = req.params;

  try {
    const file = getFileById(id);
    if (!file) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'File not found' }
      });
    }

    const url = await getFreshCdnUrl(file);
    if (!url) {
      return res.status(410).json({
        error: { code: 'FILE_UNAVAILABLE', message: 'File is no longer available in storage' }
      });
    }

    // Short cache so browsers reuse the redirect for a while, but always well
    // inside the lifetime of the signature it points at.
    res.set('Cache-Control', 'public, max-age=300');
    // Helmet defaults to same-origin, which would block this from a client
    // served on another origin (the PUBLIC_FILE_BASE_URL setup).
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.redirect(302, url);
  } catch (error) {
    console.error('File redirect error:', error.message);
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An error occurred while resolving the file' }
    });
  }
});

/**
 * GET /api/files/:id
 * Retrieve details of a file.
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const file = getFileById(id);
    if (!file) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'File not found'
        }
      });
    }

    return res.status(200).json({
      data: {
        id: file.id,
        cdn_url: fileUrlById(file.id),
        mime_type: file.mime_type,
        purpose: file.purpose,
        original_name: file.original_name
      }
    });
  } catch (error) {
    console.error('File retrieval error:', error.message);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while retrieving the file'
      }
    });
  }
});

module.exports = router;
