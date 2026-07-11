/**
 * ConnectModa – Monitor de Colas
 * Estadísticas en tiempo real, health check y dashboard opcional (Bull Board)
 *
 * Mejoras v2:
 *  - metricas() incluye "tasas" (tasa de fallo por cola) para detectar problemas
 *  - healthCheck() tiene timeout para no bloquear si Redis no responde
 *  - iniciarMonitorPeriodico() alerta automáticamente cuando tasa de fallo > umbral
 *  - reintentarFallidos() permite reintentar jobs fallidos de una cola
 *  - retryJob() permite reintentar un job específico por ID
 */

const { COLAS, QUEUE_ENABLED } = require("./queues");

// Umbral: si más del 10 % de jobs totales son fallidos, se loguea una alerta
const UMBRAL_TASA_FALLO = 0.10;

// ─────────────────────────────────────────────
//  OBTENER MÉTRICAS DE UNA COLA
// ─────────────────────────────────────────────
async function metricasCola(nombre, cola) {
  if (!cola) return { nombre, deshabilitada: true };

  try {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      cola.getWaitingCount(),
      cola.getActiveCount(),
      cola.getCompletedCount(),
      cola.getFailedCount(),
      cola.getDelayedCount(),
      cola.getPausedCount(),
    ]);

    const total      = waiting + active + completed + failed + delayed;
    // MEJORA: calcular tasa de fallo sobre el total procesado (completados + fallidos)
    const procesados = completed + failed;
    const tasaFallo  = procesados > 0 ? Math.round((failed / procesados) * 100) / 100 : 0;

    return {
      nombre,
      estado:    paused ? "pausada" : "activa",
      jobs:      { waiting, active, completed, failed, delayed, paused },
      total,
      tasaFallo, // 0.0 – 1.0 (e.g. 0.05 = 5 % de fallo)
    };
  } catch (err) {
    return { nombre, error: err.message };
  }
}

/** Obtener métricas de todas las colas */
async function metricas() {
  if (!QUEUE_ENABLED) return { habilitadas: false };

  const resultados = await Promise.all(
    Object.entries(COLAS).map(([nombre, cola]) => metricasCola(nombre, cola))
  );

  const totalFallidos = resultados.reduce((acc, c) => acc + (c.jobs?.failed  || 0), 0);
  const totalActivos  = resultados.reduce((acc, c) => acc + (c.jobs?.active  || 0), 0);
  const totalEspera   = resultados.reduce((acc, c) => acc + (c.jobs?.waiting || 0), 0);

  // Cola con mayor tasa de fallo (para alertas rápidas)
  const colaMasFallida = resultados
    .filter((c) => !c.deshabilitada && !c.error)
    .sort((a, b) => (b.tasaFallo || 0) - (a.tasaFallo || 0))[0];

  return {
    habilitadas: true,
    resumen: {
      totalFallidos,
      totalActivos,
      totalEspera,
      colas:           resultados.length,
      colaMasFallida:  colaMasFallida?.tasaFallo > 0 ? colaMasFallida.nombre : null,
    },
    colas: resultados,
    ts:    Date.now(),
  };
}

// ─────────────────────────────────────────────
//  HEALTH CHECK
//  MEJORA: timeout de 3s para no bloquear el endpoint /health
// ─────────────────────────────────────────────
async function healthCheck() {
  if (!QUEUE_ENABLED) return { ok: true, modo: "deshabilitado" };

  const TIMEOUT_MS = 3000;

  const checks = await Promise.all(
    Object.entries(COLAS).map(async ([nombre, cola]) => {
      if (!cola) return { nombre, ok: false, motivo: "no inicializada" };

      const readyPromise = cola
        .isReady()
        .then(() => ({ nombre, ok: true }))
        .catch((err) => ({ nombre, ok: false, motivo: err.message }));

      const timeout = new Promise((resolve) =>
        setTimeout(
          () => resolve({ nombre, ok: false, motivo: `timeout después de ${TIMEOUT_MS}ms` }),
          TIMEOUT_MS
        )
      );

      return Promise.race([readyPromise, timeout]);
    })
  );

  const todasOk = checks.every((c) => c.ok);
  return { ok: todasOk, colas: checks };
}

// ─────────────────────────────────────────────
//  LIMPIAR JOBS FALLIDOS
// ─────────────────────────────────────────────
async function limpiarFallidos(nombreCola) {
  const cola = COLAS[nombreCola];
  if (!cola) return { error: `Cola "${nombreCola}" no encontrada` };

  await cola.clean(0, "failed");
  log("info", "fallidos_limpiados", { cola: nombreCola });
  return { ok: true, cola: nombreCola };
}

async function limpiarTodasFallidas() {
  const resultados = await Promise.all(Object.keys(COLAS).map(limpiarFallidos));
  return resultados;
}

// ─────────────────────────────────────────────
//  REINTENTAR JOBS FALLIDOS
//  MEJORA: permite reintentar todos los fallidos de una cola o uno por ID
// ─────────────────────────────────────────────

/** Reintentar todos los jobs fallidos de una cola */
async function reintentarFallidos(nombreCola) {
  const cola = COLAS[nombreCola];
  if (!cola) return { error: `Cola "${nombreCola}" no encontrada` };

  try {
    const jobs = await cola.getFailed();
    await Promise.all(jobs.map((j) => j.retry()));
    log("info", "fallidos_reintentados", { cola: nombreCola, cantidad: jobs.length });
    return { ok: true, cola: nombreCola, reintentados: jobs.length };
  } catch (err) {
    log("error", "error_reintentar", { cola: nombreCola, error: err.message });
    return { error: err.message };
  }
}

/** Reintentar un job específico por ID */
async function reintentarJob(nombreCola, jobId) {
  const cola = COLAS[nombreCola];
  if (!cola) return { error: `Cola "${nombreCola}" no encontrada` };

  try {
    const job = await cola.getJob(jobId);
    if (!job) return { error: `Job ${jobId} no encontrado` };
    await job.retry();
    log("info", "job_reintentado", { cola: nombreCola, jobId });
    return { ok: true, cola: nombreCola, jobId };
  } catch (err) {
    log("error", "error_reintentar_job", { cola: nombreCola, jobId, error: err.message });
    return { error: err.message };
  }
}

// ─────────────────────────────────────────────
//  JOBS FALLIDOS RECIENTES (para debug)
// ─────────────────────────────────────────────
async function jobsFallidosRecientes(nombreCola, limite = 10) {
  const cola = COLAS[nombreCola];
  if (!cola) return [];

  try {
    const jobs = await cola.getFailed(0, limite - 1);
    return jobs.map((j) => ({
      id:        j.id,
      tipo:      j.data?.tipo || j.name,
      error:     j.failedReason,
      intentos:  j.attemptsMade,
      timestamp: j.timestamp,
      datos:     j.data,
    }));
  } catch (err) {
    log("error", "error_obtener_fallidos", { cola: nombreCola, error: err.message });
    return [];
  }
}

// ─────────────────────────────────────────────
//  BULL BOARD (Dashboard visual — opcional)
//  Instalar: npm install @bull-board/express @bull-board/api
// ─────────────────────────────────────────────
function crearBullBoard(app) {
  try {
    const { createBullBoard } = require("@bull-board/api");
    const { BullAdapter }     = require("@bull-board/api/bullAdapter");
    const { ExpressAdapter }  = require("@bull-board/express");

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/admin/queues");

    const colasActivas = Object.entries(COLAS)
      .filter(([, c]) => c !== null)
      .map(([, c]) => new BullAdapter(c));

    createBullBoard({ queues: colasActivas, serverAdapter });

    app.use("/admin/queues", serverAdapter.getRouter());

    log("info", "bull_board_activo", { ruta: "/admin/queues" });
    return true;
  } catch (err) {
    log("warn", "bull_board_no_disponible", {
      msg:   "Instala @bull-board/express para el dashboard visual",
      error: err.message,
    });
    return false;
  }
}

// ─────────────────────────────────────────────
//  MONITOREO PERIÓDICO (log cada 5 minutos)
//  MEJORA: detecta tasa de fallo elevada y emite alerta diferenciada
// ─────────────────────────────────────────────
let _intervaloMonitor = null;

function iniciarMonitorPeriodico(intervaloMs = 5 * 60 * 1000) {
  if (_intervaloMonitor) return;

  _intervaloMonitor = setInterval(async () => {
    try {
      const m = await metricas();

      // Alertar si alguna cola supera el umbral de fallo
      for (const cola of m.colas || []) {
        if ((cola.tasaFallo || 0) >= UMBRAL_TASA_FALLO) {
          log("warn", "tasa_fallo_elevada", {
            cola:      cola.nombre,
            tasaFallo: `${Math.round(cola.tasaFallo * 100)}%`,
            fallidos:  cola.jobs?.failed,
          });
        }
      }

      log("info", "heartbeat", {
        activos:  m.resumen?.totalActivos,
        espera:   m.resumen?.totalEspera,
        fallidos: m.resumen?.totalFallidos,
      });
    } catch (err) {
      log("error", "monitor_error", { error: err.message });
    }
  }, intervaloMs);

  log("info", "monitor_iniciado", { intervaloMs });
}

function detenerMonitor() {
  if (_intervaloMonitor) {
    clearInterval(_intervaloMonitor);
    _intervaloMonitor = null;
  }
}

// ─────────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────────
function log(nivel, accion, datos = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    nivel,
    modulo: "QueueMonitor",
    accion,
    ...datos,
  };
  nivel === "error"
    ? console.error(JSON.stringify(entry))
    : console.log(JSON.stringify(entry));
}

module.exports = {
  metricas,
  healthCheck,
  limpiarFallidos,
  limpiarTodasFallidas,
  reintentarFallidos,
  reintentarJob,
  jobsFallidosRecientes,
  crearBullBoard,
  iniciarMonitorPeriodico,
  detenerMonitor,
};
