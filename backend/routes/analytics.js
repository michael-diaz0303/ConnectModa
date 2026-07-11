/**
 * ConnectModa – Rutas de Analytics
 * Base: /api/analytics
 */

const express = require("express");
const router  = express.Router();

const {
  getDashboard,
  getProductoAnalytics,
  getUsuarioAnalytics,
  generarReporte,
  getChartData,
} = require("../controllers/analyticsController");

const { verificarToken, soloAdmin } = require("../middleware/auth");

router.use(verificarToken);

// ─────────────────────────────────────────────
//  GET /api/analytics/dashboard?periodo=semana
//  KPIs, tendencia, top productos, top categorías, top búsquedas
//  Solo Admin / Emprendedor
// ─────────────────────────────────────────────
router.get("/dashboard", getDashboard);

// ─────────────────────────────────────────────
//  GET /api/analytics/producto/:id?periodo=mes
//  Vistas, ventas, ingresos, conversión de un producto
//  Solo dueño del producto o Admin
// ─────────────────────────────────────────────
router.get("/producto/:id", getProductoAnalytics);

// ─────────────────────────────────────────────
//  GET /api/analytics/usuario?periodo=mes
//  Resumen del vendedor autenticado: vistas, ventas, crecimiento
// ─────────────────────────────────────────────
router.get("/usuario", getUsuarioAnalytics);

// ─────────────────────────────────────────────
//  GET /api/analytics/charts/:tipo?periodo=semana
//  Datos formateados para Chart.js
//  Tipos: tendencia | categorias | top-productos
// ─────────────────────────────────────────────
router.get("/charts/:tipo", getChartData);

// ─────────────────────────────────────────────
//  POST /api/analytics/reporte
//  Solicitar generación de reporte PDF/Excel
//  Body: { tipo, desde, hasta, formato }
// ─────────────────────────────────────────────
router.post("/reporte", generarReporte);

module.exports = router;
