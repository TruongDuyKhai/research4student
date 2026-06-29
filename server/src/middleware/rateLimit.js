const rateLimit = require('express-rate-limit');

const customHandler = (req, res) => {
  return res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.'
    }
  });
};

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5000,
  handler: customHandler,
  standardHeaders: true,
  legacyHeaders: false
});

const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000,
  handler: customHandler,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200,
  skipSuccessfulRequests: true,
  handler: customHandler,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  apiLimiter,
  writeLimiter,
  authLimiter
};
