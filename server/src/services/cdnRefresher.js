const cron = require('node-cron');
const { filesDb } = require('../db/connections');
const { refreshFilesBulk } = require('./discordStorage');

const cronExpression = process.env.CDN_REFRESH_CRON || '*/10 * * * *';

let isRunning = false;

/**
 * Re-sign the CDN URL of every stored file. Files whose Discord message was
 * deleted are skipped so a dead attachment does not burn a request every run.
 * @returns {Promise<void>}
 */
async function runRefreshCycle() {
  if (isRunning) {
    console.log('[CDN Refresher] Job is already running. Skipping.');
    return;
  }

  isRunning = true;
  const startedAt = Date.now();

  try {
    const files = filesDb.prepare('SELECT * FROM files WHERE is_dead = 0').all();
    if (files.length === 0) {
      console.log('[CDN Refresher] No files to refresh.');
      return;
    }

    const { refreshed, failed } = await refreshFilesBulk(files);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `[CDN Refresher] Completed in ${seconds}s. Refreshed: ${refreshed}, Failed: ${failed}, Total: ${files.length}`
    );
  } catch (criticalError) {
    console.error('[CDN Refresher] Critical error during batch refresh:', criticalError.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the cron schedule to periodically refresh all files
 */
function startRefresher() {
  cron.schedule(cronExpression, runRefreshCycle);
  console.log(`[CDN Refresher] Scheduled periodically using cron expression: "${cronExpression}"`);

  // Catch up immediately: after downtime every stored URL is already stale and
  // waiting for the next cron tick would serve broken links until then.
  runRefreshCycle();
}

module.exports = {
  startRefresher,
  runRefreshCycle
};
