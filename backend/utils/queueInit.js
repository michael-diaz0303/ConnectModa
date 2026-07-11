/**
 * ConnectModa – Inicializador de Colas
 * Arranca todos los procesadores y el monitor
 * Llamar una sola vez desde server.js
 *
 * Mejoras v2:
 *  - Cada procesador se carga de forma independiente; si uno falla
 *    los demás siguen funcionando (resiliencia parcial)
 *  - Log diferenciado para procesadores que fallaron vs. iniciados
 */

const { QUEUE_ENABLED } = require("./queues");
const queueMonitor      = require("./queueMonitor");

const PROCESADORES = [
  { nombre: "email",     path: "../queues/processors/emailProcessor"     },
  { nombre: "image",     path: "../queues/processors/imageProcessor"     },
  { nombre: "analytics", path: "../queues/processors/analyticsProcessor" },
  { nombre: "report",    path: "../queues/processors/reportProcessor"    },
];

function iniciarColas(app) {
  if (!QUEUE_ENABLED) {
    console.log("[Queues] ⚠️  Colas deshabilitadas (QUEUE_ENABLED=false). Los trabajos se ejecutarán inline.");
    return;
  }

  const iniciados = [];
  const fallidos  = [];

  // MEJORA: arrancar cada procesador en forma independiente
  for (const { nombre, path: procesadorPath } of PROCESADORES) {
    try {
      require(procesadorPath).iniciar();
      iniciados.push(nombre);
    } catch (err) {
      fallidos.push({ nombre, error: err.message });
      console.error(`[Queues] ✗ Procesador "${nombre}" falló al iniciar:`, err.message);
    }
  }

  // Monitor periódico (log de estado cada 5 min)
  queueMonitor.iniciarMonitorPeriodico();

  // Dashboard Bull Board (si está instalado)
  if (app) queueMonitor.crearBullBoard(app);

  if (iniciados.length > 0) {
    console.log(`[Queues] ✓ Procesadores activos: ${iniciados.join(", ")}`);
  }
  if (fallidos.length > 0) {
    console.warn(`[Queues] ⚠️  Procesadores con error: ${fallidos.map((f) => f.nombre).join(", ")}`);
  }

  console.log("[Queues] ✓ Dashboard: http://localhost:3000/admin/queues (requiere @bull-board/express)");
}

module.exports = { iniciarColas };
