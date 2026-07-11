const logger = require('../utils/logger');

// ── CLASE DE ERROR PERSONALIZADA ───────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode  = statusCode;
    this.status      = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── MANEJADORES DE ERRORES ESPECÍFICOS ────────────────────────────────────────

// Error de ID inválido de MongoDB
const handleCastErrorDB = (err) =>
  new AppError(`ID inválido: ${err.value}`, 400);

// Error de campo duplicado en MongoDB
const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  return new AppError(`El campo "${field}" con valor "${value}" ya existe.`, 409);
};

// Error de validación de Mongoose
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  return new AppError(`Datos inválidos: ${errors.join('. ')}`, 422);
};

// Token JWT inválido
const handleJWTError = () =>
  new AppError('Token inválido o expirado. Por favor inicia sesión nuevamente.', 401);

// Token JWT expirado
const handleJWTExpiredError = () =>
  new AppError('Tu sesión ha expirado. Por favor inicia sesión nuevamente.', 401);

// ── RESPUESTA EN DESARROLLO ────────────────────────────────────────────────────
const sendErrorDev = (err, res) => {
  logger.error(`DEV ERROR: ${err.message}`, { stack: err.stack });
  res.status(err.statusCode).json({
    success:    false,
    statusCode: err.statusCode,
    status:     err.status,
    message:    err.message,
    stack:      err.stack,
    error:      err,
    timestamp:  new Date().toISOString(),
  });
};

// ── RESPUESTA EN PRODUCCIÓN ────────────────────────────────────────────────────
const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    // Error conocido y controlado: mostrar mensaje al cliente
    res.status(err.statusCode).json({
      success:    false,
      statusCode: err.statusCode,
      message:    err.message,
      timestamp:  new Date().toISOString(),
    });
  } else {
    // Error desconocido: no exponer detalles al cliente
    logger.error('ERROR INESPERADO:', err);
    res.status(500).json({
      success:    false,
      statusCode: 500,
      message:    'Ocurrió un error interno. Por favor intenta más tarde.',
      timestamp:  new Date().toISOString(),
    });
  }
};

// ── MIDDLEWARE GLOBAL DE ERRORES ───────────────────────────────────────────────
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status     = err.status     || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err, message: err.message };

    if (err.name === 'CastError')            error = handleCastErrorDB(error);
    if (err.code === 11000)                  error = handleDuplicateFieldsDB(error);
    if (err.name === 'ValidationError')      error = handleValidationErrorDB(error);
    if (err.name === 'JsonWebTokenError')    error = handleJWTError();
    if (err.name === 'TokenExpiredError')    error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

// ── MIDDLEWARE PARA RUTAS NO ENCONTRADAS ───────────────────────────────────────
const notFound = (req, res, next) => {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404));
};

module.exports = { errorHandler, notFound, AppError };