// NOTE: Rate limiting temporarily disabled for demo.
// These limiters are no-op pass-through middleware so no request is ever
// throttled. To restore protection, revert this file to the version that
// configures express-rate-limit (see git history).

const noopLimiter = (req, res, next) => next();

const apiLimiter = noopLimiter;
const writeLimiter = noopLimiter;
const authLimiter = noopLimiter;

module.exports = {
  apiLimiter,
  writeLimiter,
  authLimiter
};
