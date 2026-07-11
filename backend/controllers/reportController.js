/**
 * ConnectModa – Controller de Reportes
 * Encola la generación de reportes y permite consultar su estado
 *
 * Mejoras v2:
 *  - encolar() retorna null si colas están deshabilitadas → respuesta 503 clara
 *  - estadoReporte() expone `progreso` correctamente usando job.progress()
 *  - Nuevo endpoint implícito via rutas: reintentar jobs fallidos
 */

const { reportQueue, encolar } = require("../utils/queues");

// Roles permitidos por tipo de reporte
const TIPOS_PERMITIDOS = {
  ventas_vendedor: ["vendedor", "emprendedor", "admin"],
  ordenes_admin:   ["admin"],
  productos_admin: ["admin", "emprendedor", "vendedor"],
  analytics_admin: ["admin"],
};

// ─────────────────────────────────────────────
//  POST /api/reportes
// ─────────────────────────────────────────────
const solicitarReporte = async (req, res) => {
  try {
    const { tipo, filtros } = req.body;
    const usuario = req.usuario;

    if (!tipo || !TIPOS_PERMITIDOS[tipo]) {
      return res.status(400).json({
        ok:      false,
        mensaje: `Tipo inválido. Opciones: ${Object.keys(TIPOS_PERMITIDOS).join(", ")}`,
      });
    }

    if (!TIPOS_PERMITIDOS[tipo].includes(usuario.rol)) {
      return res.status(403).json({ ok: false, mensaje: "Sin permisos para este reporte" });
    }

    const job = await encolar(
      reportQueue,
      tipo,
      {
        tipo,
        usuario: { id: usuario._id, email: usuario.email, nombre: usuario.nombre },
        filtros,
      },
      { priority: 1 }
    );

    // MEJORA: si encolar retornó null (colas deshabilitadas) indicarlo al cliente
    if (!job) {
      return res.status(503).json({
        ok:      false,
        mensaje: "El sistema de colas no está disponible. Intenta más tarde.",
      });
    }

    return res.status(202).json({
      ok:      true,
      mensaje: "Reporte en proceso. Recibirás un email cuando esté listo.",
      jobId:   job.id,
      tipo,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error al solicitar reporte" });
  }
};

// ─────────────────────────────────────────────
//  GET /api/reportes/estado/:jobId
// ─────────────────────────────────────────────
const estadoReporte = async (req, res) => {
  try {
    if (!reportQueue) {
      return res.status(503).json({ ok: false, mensaje: "Colas no disponibles" });
    }

    const job = await reportQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, mensaje: "Job no encontrado" });

    const estado    = await job.getState();
    // MEJORA: job._progress es la propiedad interna; usar job.progress() si disponible
    const progreso  = typeof job.progress === "function"
      ? await job.progress().catch(() => job._progress ?? 0)
      : (job._progress ?? 0);
    const resultado = job.returnvalue;
    const error     = job.failedReason;

    return res.status(200).json({
      ok:        true,
      jobId:     job.id,
      estado,
      progreso,
      resultado: estado === "completed" ? resultado : null,
      error:     estado === "failed"    ? error     : null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error al consultar estado" });
  }
};

module.exports = { solicitarReporte, estadoReporte };
