const rateLimit = require('express-rate-limit');
const { AppError } = require('./errorHandler');

// ── LIMITER GENERAL (todas las rutas) ─────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  message:  { success: false, message: 'Demasiadas solicitudes. Intenta en unos minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req, res, next, options) => {
    next(new AppError(options.message.message, 429));
  },
});

// ── LIMITER ESTRICTO (login / auth) ───────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máx 10 intentos de login
  message: { success: false, message: 'Demasiados intentos de autenticación. Intenta en 15 minutos.' },
  skipSuccessfulRequests: true,
  handler: (req, res, next, options) => {
    next(new AppError(options.message.message, 429));
  },
});

// ── LIMITER PARA UPLOADS ──────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30,
  message: { success: false, message: 'Límite de subida de archivos alcanzado. Intenta en 1 hora.' },
  handler: (req, res, next, options) => {
    next(new AppError(options.message.message, 429));
  },
});

module.exports = { generalLimiter, authLimiter, uploadLimiter };