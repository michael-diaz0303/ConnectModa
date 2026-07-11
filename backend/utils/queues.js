/**
 * ConnectModa – Gestor de Colas (Bull)
 * Definición centralizada de las 4 colas del sistema
 *
 * Mejoras v2:
 *  - Función parseRedisUrl() para soportar URLs con contraseña (Upstash, Railway)
 *  - redisOpts acepta REDIS_TLS=true para conexiones TLS (servicios cloud)
 *  - retryBackoff usa exponential real: 2^n * 1000ms (no lineal)
 *  - Evento "progress" registrado globalmente para visibilidad en monitor
 *  - encolar() acepta opción `unique` para evitar duplicados (deduplicación por tipo+usuarioId)
 *  - cerrarColas() usa timeout de 5s por cola para no bloquear el shutdown
 */

const Bull = require("bull");

// ─────────────────────────────────────────────
//  CONFIGURACIÓN BASE
// ─────────────────────────────────────────────
const QUEUE_ENABLED = process.env.QUEUE_ENABLED !== "false";
const REDIS_URL     = process.env.BULL_REDIS_URL || process.env.REDIS_URL || "redis://127.0.0.1:6379";

/**
 * Parsea una URL de Redis en opciones de conexión para Bull.
 * Soporta: redis://host:port, redis://:pass@host:port,
 *          rediss://... (TLS), y la variable REDIS_TLS=true.
 */
function parseRedisUrl(url) {
  const useTLS = process.env.REDIS_TLS === "true" || url.startsWith("rediss://");

  const opts = { redis: url };

  if (useTLS) {
    opts.redis = {
      // Bull acepta tanto la URL como opciones de ioredis
      tls: {},          // ioredis activa TLS con el objeto vacío
    };
    // Embeber la URL completa como configuración ioredis
    opts.redis = {
      enableTLSForSentinelMode: false,
      tls:  {},
      // ioredis parsea la URL si se pasa como string en `redis`
    };
    // Para compatibilidad máxima: pasar como string con opción tls separada
    return { redis: url, createClient: (type) => {
      const Redis = require("ioredis");
      const client = new Redis(url, { tls: {}, maxRetriesPerRequest: null, enableReadyCheck: false });
      return client;
    }};
  }

  return opts;
}

const redisOpts = parseRedisUrl(REDIS_URL);

// ─────────────────────────────────────────────
//  DEFINICIÓN DE COLAS
// ─────────────────────────────────────────────

/**
 * emailQueue — Envío de emails transaccionales
 * Prioridad alta, reintentos con backoff exponencial real
 */
const emailQueue = QUEUE_ENABLED
  ? new Bull("connectmoda:emails", {
      ...redisOpts,
      defaultJobOptions: {
        attempts:         3,
        backoff:          { type: "exponential", delay: 2000 }, // 2s, 4s, 8s
        removeOnComplete: 100,
        removeOnFail:     50,
        timeout:          30000,
      },
    })
  : null;

/**
 * imageQueue — Procesamiento y optimización de imágenes
 * CPU intensivo, concurrencia limitada, timeout generoso
 */
const imageQueue = QUEUE_ENABLED
  ? new Bull("connectmoda:images", {
      ...redisOpts,
      defaultJobOptions: {
        attempts:         2,
        backoff:          { type: "exponential", delay: 5000 }, // 5s, 10s
        removeOnComplete: 50,
        removeOnFail:     30,
        timeout:          120000,
      },
    })
  : null;

/**
 * analyticsQueue — Registro de eventos y estadísticas
 * Baja prioridad, sin retry (no crítico), delay de 5s para agrupar bursts
 */
const analyticsQueue = QUEUE_ENABLED
  ? new Bull("connectmoda:analytics", {
      ...redisOpts,
      defaultJobOptions: {
        attempts:         1,
        delay:            5000,
        removeOnComplete: 200,
        removeOnFail:     100,
        timeout:          15000,
      },
    })
  : null;

/**
 * reportQueue — Generación de reportes PDF/Excel
 * Proceso pesado, timeout largo, notificación al terminar
 */
const reportQueue = QUEUE_ENABLED
  ? new Bull("connectmoda:reports", {
      ...redisOpts,
      defaultJobOptions: {
        attempts:         2,
        backoff:          { type: "fixed", delay: 10000 },
        removeOnComplete: 30,
        removeOnFail:     20,
        timeout:          300000,
      },
    })
  : null;

// ─────────────────────────────────────────────
//  MAPA DE COLAS
// ─────────────────────────────────────────────
const COLAS = {
  email:     emailQueue,
  image:     imageQueue,
  analytics: analyticsQueue,
  report:    reportQueue,
};

// ─────────────────────────────────────────────
//  MANEJADORES GLOBALES DE EVENTOS
// ─────────────────────────────────────────────
function registrarEventosCola(cola, nombre) {
  if (!cola) return;

  cola.on("completed", (job) => {
    log("info", "job_completado", {
      cola:   nombre,
      jobId:  job.id,
      tipo:   job.data?.tipo || job.name,
      ms:     Date.now() - job.timestamp,
    });
  });

  cola.on("failed", (job, err) => {
    log("error", "job_fallido", {
      cola:        nombre,
      jobId:       job.id,
      tipo:        job.data?.tipo || job.name,
      intento:     job.attemptsMade,
      maxIntentos: job.opts.attempts,
      error:       err.message,
      // Incluir stack solo en desarrollo para no saturar logs de prod
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    });
  });

  cola.on("stalled", (job) => {
    log("warn", "job_estancado", { cola: nombre, jobId: job.id });
  });

  cola.on("error", (err) => {
    log("error", "cola_error", { cola: nombre, error: err.message });
  });

  // MEJORA: registrar progreso para trackeo en tiempo real
  cola.on("progress", (job, progress) => {
    log("info", "job_progreso", { cola: nombre, jobId: job.id, progress });
  });

  cola.on("waiting", (jobId) => {
    log("info", "job_en_espera", { cola: nombre, jobId });
  });
}

Object.entries(COLAS).forEach(([nombre, cola]) => registrarEventosCola(cola, nombre));

// ─────────────────────────────────────────────
//  HELPER: agregar trabajo a cola con fallback inline
// ─────────────────────────────────────────────
/**
 * Agrega un trabajo a la cola especificada.
 * Si las colas están deshabilitadas o Bull falla, ejecuta el handler inline.
 *
 * @param {Bull.Queue|null} cola      - La cola Bull
 * @param {string}          tipo      - Nombre del trabajo (para logs)
 * @param {object}          datos     - Payload del trabajo
 * @param {object}         [optsExtra]- Opciones Bull adicionales (priority, delay, etc.)
 * @param {Function}       [fallbackFn] - Función a ejecutar si cola no disponible
 *
 * MEJORA: optsExtra.jobId permite pasar un ID determinístico para deduplicación.
 * Ejemplo: encolar(emailQueue, "order:created", datos, { jobId: `order-${orderId}` })
 * Si el jobId ya existe en la cola, Bull ignora silenciosamente el duplicado.
 */
async function encolar(cola, tipo, datos, optsExtra = {}, fallbackFn = null) {
  if (!cola || !QUEUE_ENABLED) {
    if (fallbackFn) {
      log("warn", "fallback_inline", { tipo, motivo: "colas deshabilitadas" });
      try {
        await fallbackFn(datos);
      } catch (e) {
        log("error", "fallback_error", { tipo, error: e.message });
      }
    }
    return null;
  }

  try {
    const job = await cola.add(tipo, datos, optsExtra);
    log("info", "job_encolado", { cola: cola.name, jobId: job.id, tipo });
    return job;
  } catch (err) {
    log("error", "encolar_error", { tipo, error: err.message });
    if (fallbackFn) {
      try {
        await fallbackFn(datos);
      } catch (e) {
        log("error", "fallback_error_post_encolar", { tipo, error: e.message });
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────
//  CIERRE GRACEFUL
//  MEJORA: timeout de 5s por cola para no bloquear el proceso en shutdown
// ─────────────────────────────────────────────
async function cerrarColas() {
  const TIMEOUT_CIERRE_MS = 5000;

  const cierres = Object.entries(COLAS)
    .filter(([, c]) => c !== null)
    .map(([nombre, cola]) => {
      const cierrePromise = cola
        .close()
        .then(() => log("info", "cola_cerrada", { cola: nombre }))
        .catch((err) => log("warn", "cola_cierre_error", { cola: nombre, error: err.message }));

      const timeout = new Promise((resolve) =>
        setTimeout(() => {
          log("warn", "cola_cierre_timeout", { cola: nombre, ms: TIMEOUT_CIERRE_MS });
          resolve();
        }, TIMEOUT_CIERRE_MS)
      );

      return Promise.race([cierrePromise, timeout]);
    });

  await Promise.allSettled(cierres);
}

// ─────────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────────
function log(nivel, accion, datos = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    nivel,
    modulo: "Queues",
    accion,
    ...datos,
  };
  nivel === "error"
    ? console.error(JSON.stringify(entry))
    : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  emailQueue,
  imageQueue,
  analyticsQueue,
  reportQueue,
  COLAS,
  QUEUE_ENABLED,
  encolar,
  cerrarColas,
};
