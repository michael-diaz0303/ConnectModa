/**
 * ConnectModa – Rutas de Reportes y Monitor de Colas
 *
 * Mejoras v2:
 *  - POST /api/reportes/colas/:nombre/reintentar — reintentar todos los fallidos
 *  - POST /api/reportes/colas/:nombre/jobs/:jobId/reintentar — reintentar un job
 *  - DELETE /api/reportes/colas/fallidos — limpiar fallidos de TODAS las colas
 */

const express      = require("express");
const router       = express.Router();
const { solicitarReporte, estadoReporte } = require("../controllers/reportController");
const { verificarToken, soloAdmin }        = require("../middleware/auth");
const queueMonitor = require("../utils/queueMonitor");

router.use(verificarToken);

// ── Reportes ──────────────────────────────────────────────────────────────────
// POST   /api/reportes              → solicitar reporte (encola)
router.post("/", solicitarReporte);

// GET    /api/reportes/estado/:jobId → estado de un job
router.get("/estado/:jobId", estadoReporte);

// ── Monitor de colas (solo Admin) ─────────────────────────────────────────────
// GET    /api/reportes/colas/stats
router.get("/colas/stats", soloAdmin, async (req, res) => {
  try {
    const m = await queueMonitor.metricas();
    res.json({ ok: true, ...m });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// GET    /api/reportes/colas/health
router.get("/colas/health", soloAdmin, async (req, res) => {
  try {
    const h = await queueMonitor.healthCheck();
    res.status(h.ok ? 200 : 503).json({ ok: h.ok, ...h });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// GET    /api/reportes/colas/:nombre/fallidos
router.get("/colas/:nombre/fallidos", soloAdmin, async (req, res) => {
  try {
    const limite = Math.min(parseInt(req.query.limite) || 20, 100);
    const jobs   = await queueMonitor.jobsFallidosRecientes(req.params.nombre, limite);
    res.json({ ok: true, jobs });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// DELETE /api/reportes/colas/:nombre/fallidos
router.delete("/colas/:nombre/fallidos", soloAdmin, async (req, res) => {
  try {
    const r = await queueMonitor.limpiarFallidos(req.params.nombre);
    res.json(r);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// DELETE /api/reportes/colas/fallidos  (todas las colas)
router.delete("/colas/fallidos", soloAdmin, async (req, res) => {
  try {
    const r = await queueMonitor.limpiarTodasFallidas();
    res.json({ ok: true, resultado: r });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// MEJORA: POST /api/reportes/colas/:nombre/reintentar — reintentar todos los fallidos
router.post("/colas/:nombre/reintentar", soloAdmin, async (req, res) => {
  try {
    const r = await queueMonitor.reintentarFallidos(req.params.nombre);
    res.json(r);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

// MEJORA: POST /api/reportes/colas/:nombre/jobs/:jobId/reintentar — reintentar uno
router.post("/colas/:nombre/jobs/:jobId/reintentar", soloAdmin, async (req, res) => {
  try {
    const r = await queueMonitor.reintentarJob(req.params.nombre, req.params.jobId);
    res.json(r);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
});

module.exports = router;
