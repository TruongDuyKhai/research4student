const { filesDb } = require('../db/connections');
const { client, getStorageChannel } = require('./discordClient');

// Discord signs CDN URLs with a short-lived signature. Refresh before the
// signature actually lapses so a URL handed to a browser stays usable.
const REFRESH_MARGIN_MS = parseInt(process.env.CDN_REFRESH_MARGIN_MINUTES || '60', 10) * 60 * 1000;

// Discord's bulk refresh endpoint accepts at most 50 URLs per request.
const REFRESH_BATCH_SIZE = 50;

/**
 * Extract expiration date from Discord CDN URL
 * @param {string} url
 * @returns {string|null} ISO timestamp
 */
function parseExpiryFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const ex = parsedUrl.searchParams.get('ex');
    if (!ex) return null;
    return new Date(parseInt(ex, 16) * 1000).toISOString();
  } catch (error) {
    return null;
  }
}

/**
 * Build the permanent, public URL the site hands out for a file. It points at
 * our own proxy route instead of Discord, so an URL embedded in a page never
 * goes stale even if the signed Discord URL behind it rotates.
 * @param {number|null} fileId
 * @returns {string|null}
 */
function fileUrlById(fileId) {
  if (!fileId) return null;
  const base = (process.env.PUBLIC_FILE_BASE_URL || '').replace(/\/$/, '');
  return `${base}/api/files/${fileId}/raw`;
}

/**
 * Retrieve metadata of a file by its database id
 * @param {number} id
 * @returns {object|undefined}
 */
function getFileById(id) {
  return filesDb.prepare('SELECT * FROM files WHERE id = ?').get(id);
}

/**
 * Whether a stored CDN URL is expired or about to expire
 * @param {object} fileRow
 * @returns {boolean}
 */
function needsRefresh(fileRow) {
  if (!fileRow.cdn_url) return true;
  if (!fileRow.cdn_url_expires_at) return false;
  return new Date(fileRow.cdn_url_expires_at).getTime() - REFRESH_MARGIN_MS <= Date.now();
}

/**
 * Persist a freshly signed CDN URL
 * @param {number} fileId
 * @param {string} url
 */
function storeRefreshedUrl(fileId, url) {
  filesDb.prepare(`
    UPDATE files
    SET cdn_url = ?, cdn_url_expires_at = ?, last_refreshed_at = datetime('now'),
        refresh_failed_at = NULL, is_dead = 0
    WHERE id = ?
  `).run(url, parseExpiryFromUrl(url), fileId);
}

/**
 * Mark a file whose Discord message no longer exists, so later runs skip it
 * @param {number} fileId
 */
function markDead(fileId) {
  filesDb.prepare(`
    UPDATE files SET is_dead = 1, refresh_failed_at = datetime('now') WHERE id = ?
  `).run(fileId);
}

/**
 * Upload buffer to Discord and log the file record
 * @param {object} param0 - { buffer, filename, mimetype, purpose, uploaderId }
 * @returns {Promise<object>} Created file record
 */
async function uploadFile({ buffer, filename, mimetype, purpose, uploaderId }) {
  const channel = await getStorageChannel();

  // Send buffer as attachment to channel
  const message = await channel.send({
    files: [{ attachment: buffer, name: filename }]
  });

  const attachment = message.attachments.first();
  if (!attachment) {
    throw new Error('Failed to upload file to Discord: attachment could not be created');
  }

  const cdnUrl = attachment.url;
  const cdnUrlExpiresAt = parseExpiryFromUrl(cdnUrl);

  const info = filesDb.prepare(`
    INSERT INTO files (
      uploader_id, original_name, mime_type, size_bytes, purpose,
      discord_message_id, discord_channel_id, cdn_url, cdn_url_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uploaderId,
    filename,
    mimetype,
    buffer.length,
    purpose,
    message.id,
    channel.id,
    cdnUrl,
    cdnUrlExpiresAt
  );

  return getFileById(info.lastInsertRowid);
}

/**
 * Refresh the CDN URL of a single file by re-fetching its Discord message.
 * Slower than the bulk path but reports precisely why a file failed.
 * @param {object} fileRow
 * @returns {Promise<string>} The refreshed CDN URL
 */
async function refreshFileUrl(fileRow) {
  const channel = await getStorageChannel();

  let message;
  try {
    message = await channel.messages.fetch(fileRow.discord_message_id);
  } catch (error) {
    // 10008 = Unknown Message: the attachment is gone for good.
    if (error.code === 10008) {
      markDead(fileRow.id);
      throw new Error(`Discord message ${fileRow.discord_message_id} no longer exists`);
    }
    throw error;
  }

  const attachment = message.attachments.first();
  if (!attachment) {
    markDead(fileRow.id);
    throw new Error(`Attachment not found in Discord message: ${fileRow.discord_message_id}`);
  }

  storeRefreshedUrl(fileRow.id, attachment.url);
  return attachment.url;
}

/**
 * Refresh many files at once through Discord's bulk re-signing endpoint, which
 * costs a single request per 50 files instead of one message fetch each.
 * @param {object[]} fileRows
 * @returns {Promise<{ refreshed: number, failed: number }>}
 */
async function refreshFilesBulk(fileRows) {
  let refreshed = 0;
  let failed = 0;

  for (let i = 0; i < fileRows.length; i += REFRESH_BATCH_SIZE) {
    const batch = fileRows.slice(i, i + REFRESH_BATCH_SIZE);

    // Several records can point at the same attachment, so group rows per URL
    // instead of keying one row per URL and silently dropping the duplicates.
    const byUrl = new Map();
    for (const row of batch) {
      if (!byUrl.has(row.cdn_url)) byUrl.set(row.cdn_url, []);
      byUrl.get(row.cdn_url).push(row);
    }

    let response;
    try {
      response = await client.rest.post('/attachments/refresh-urls', {
        body: { attachment_urls: [...byUrl.keys()] }
      });
    } catch (error) {
      console.error('[CDN] Bulk refresh request failed, falling back per file:', error.message);
      response = null;
    }

    for (const entry of response?.refreshed_urls || []) {
      const rows = byUrl.get(entry.original);
      if (!rows || !entry.refreshed) continue;
      for (const row of rows) {
        storeRefreshedUrl(row.id, entry.refreshed);
        refreshed++;
      }
      byUrl.delete(entry.original);
    }

    // Anything the bulk endpoint did not return gets the per-message path, which
    // is also what flags permanently deleted attachments.
    for (const row of [...byUrl.values()].flat()) {
      try {
        await refreshFileUrl(row);
        refreshed++;
      } catch (error) {
        console.error(`[CDN] Failed to refresh file ID ${row.id}:`, error.message);
        failed++;
      }
    }
  }

  return { refreshed, failed };
}

/**
 * Resolve a currently valid Discord CDN URL for a file, re-signing on demand.
 * @param {object} fileRow
 * @returns {Promise<string>}
 */
async function getFreshCdnUrl(fileRow) {
  // A known-dead attachment would cost a doomed Discord call on every request.
  if (fileRow.is_dead) return fileRow.cdn_url;
  if (!needsRefresh(fileRow)) return fileRow.cdn_url;

  try {
    return await refreshFileUrl(fileRow);
  } catch (error) {
    console.error(`[CDN] On-demand refresh failed for file ID ${fileRow.id}:`, error.message);
    // Better to serve a possibly-expired URL than nothing at all.
    return fileRow.cdn_url;
  }
}

module.exports = {
  parseExpiryFromUrl,
  fileUrlById,
  getFileById,
  needsRefresh,
  uploadFile,
  refreshFileUrl,
  refreshFilesBulk,
  getFreshCdnUrl
};
