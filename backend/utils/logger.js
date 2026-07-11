const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs   = require('fs');

// Crear carpeta de logs si no existe
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// ── FORMATO PERSONALIZADO ──────────────────────────────────────────────────────
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, stack }) => {
    return stack
      ? `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`
      : `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Consola (solo en desarrollo)
    ...(process.env.NODE_ENV !== 'production'
      ? [new transports.Console({ format: format.combine(format.colorize(), logFormat) })]
      : []
    ),
    // Archivo: todos los logs
    new transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize:  5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
    // Archivo: solo errores
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
  exceptionHandlers: [
    new transports.File({ filename: path.join(logDir, 'exceptions.log') })
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join(logDir, 'rejections.log') })
  ],
});

module.exports = logger;