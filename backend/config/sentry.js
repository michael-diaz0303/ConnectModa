// src/config/sentry.js
// Configuración de Sentry para error tracking en staging y producción

const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

const initSentry = (app) => {
  const dsn = process.env.SENTRY_DSN;
  const env = process.env.NODE_ENV;

  // Solo inicializar en staging y producción
  if (!dsn || env === 'development' || env === 'test') {
    logger.info('Sentry deshabilitado en entorno:', env);
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || env,
    release: `connectmoda@${process.env.APP_VERSION || '1.0.0'}`,

    // Sampling de trazas de performance
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

    // Configuración de integrations
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      new Sentry.Integrations.Mongo({ useMongoose: true }),
    ],

    // No enviar datos sensibles
    beforeSend(event) {
      // Eliminar contraseñas y tokens de los eventos
      if (event.request?.data) {
        const sensitiveFields = ['password', 'token', 'secret', 'creditCard', 'cvv'];
        sensitiveFields.forEach((field) => {
          if (event.request.data[field]) {
            event.request.data[field] = '[REDACTED]';
          }
        });
      }
      return event;
    },
  });

  // Middleware de request tracking (ANTES de las rutas)
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());

  logger.info(`✅ Sentry inicializado (env: ${env})`);
};

// Middleware de error handler de Sentry (DESPUÉS de las rutas)
const sentryErrorHandler = () => {
  if (!process.env.SENTRY_DSN || process.env.NODE_ENV === 'test') {
    return (err, req, res, next) => next(err); // pass-through
  }
  return Sentry.Handlers.errorHandler();
};

// Capturar error manualmente
const captureError = (error, context = {}) => {
  if (!process.env.SENTRY_DSN || process.env.NODE_ENV === 'test') return;

  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    Sentry.captureException(error);
  });
};

// Capturar mensaje manualmente
const captureMessage = (message, level = 'info', context = {}) => {
  if (!process.env.SENTRY_DSN || process.env.NODE_ENV === 'test') return;

  Sentry.withScope((scope) => {
    scope.setLevel(level);
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    Sentry.captureMessage(message);
  });
};

module.exports = { initSentry, sentryErrorHandler, captureError, captureMessage };
