/**
 * ConnectModa – Router principal
 * Monta todas las rutas bajo /api/
 */

const router = require("express").Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
router.use("/auth",      require("./auth"));

// ── Recursos principales ──────────────────────────────────────────────────────
router.use("/negocios",  require("./negocioRoutes"));
router.use("/resenas",   require("./resenas"));
router.use("/productos", require("./productos"));
router.use("/ordenes",   require("./ordenes"));
router.use("/pagos",     require("./pagos"));
router.use("/upload",    require("./upload"));

// ── Funcionalidades avanzadas ─────────────────────────────────────────────────
router.use("/buscar",    require("./search"));
router.use("/ia",        require("./ia"));
router.use("/analytics", require("./analytics"));
router.use("/reportes",  require("./reportes"));

// ── Infraestructura ───────────────────────────────────────────────────────────
router.use("/health",    require("./healthRoutes"));
router.use("/webhooks",  require("./webhooks"));

module.exports = router;
