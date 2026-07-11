const { validationResult } = require('express-validator');
const { AppError }         = require('./errorHandler');

/**
 * Middleware que lee los resultados de express-validator
 * y lanza un error 422 si hay campos inválidos.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const formatted = errors.array().map(err => ({
    field:   err.path,
    message: err.msg,
    value:   err.value,
  }));

  return next(new AppError('Datos de entrada inválidos.', 422));
};

module.exports = validate;