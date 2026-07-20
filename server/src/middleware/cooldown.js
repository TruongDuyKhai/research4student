// NOTE: Action cooldown temporarily disabled for demo.
// This factory keeps the original cooldown(actionType, seconds) signature so
// every route wiring stays intact, but returns a no-op pass-through middleware
// so no action is ever throttled. To restore protection, revert this file to
// the version that queries moderationDb.action_logs (see git history).

function cooldown(actionType, seconds) {
  return (req, res, next) => next();
}

module.exports = cooldown;
