/**
 * ConnectModa - Rutas de Búsqueda
 * GET /api/buscar
 */

const express = require("express");
const router = express.Router();

const {
  searchProductos,
  searchNegocios,
  sugerencias,
  filtrosDisponibles,
} = require("../controllers/searchController");

const {
  sanitizeMiddleware,
  rateLimitBusqueda,
} = require("../middleware/sanitize");

// Aplicar sanitización a todas las rutas de búsqueda
router.use(sanitizeMiddleware);

// ─────────────────────────────────────────────
//  GET /api/buscar
//  Búsqueda avanzada con filtros y paginación
//
//  Query params:
//   q          → texto libre (nombre, descripción)
//   categoria  → categoría exacta
//   precioMin  → precio mínimo (número)
//   precioMax  → precio máximo (número)
//   ciudad     → ciudad del vendedor
//   talla      → talla (puede ser array: ?talla=S&talla=M)
//   rating     → rating mínimo (0-5)
//   ordenar    → popular | precioAsc | precioDesc | nuevo
//   pagina     → número de página (default: 1)
//   limite     → items por página (default: 12, max: 50)
//
//  Ejemplos:
//   /api/buscar?q=vestido&precioMax=100000
//   /api/buscar?categoria=accesorios&ciudad=Bogotá
//   /api/buscar?ordenar=precioAsc&pagina=2
//   /api/buscar?talla=S&talla=M&rating=4
// ─────────────────────────────────────────────
router.get("/", rateLimitBusqueda, searchProductos);

// ─────────────────────────────────────────────
//  GET /api/buscar/sugerencias?q=vest
//  Autocomplete rápido (máx 8 resultados)
// ─────────────────────────────────────────────
router.get("/sugerencias", rateLimitBusqueda, sugerencias);

// ─────────────────────────────────────────────
//  GET /api/buscar/filtros
//  Devuelve todos los filtros disponibles
//  (categorías, ciudades, rango de precios, tallas)
// ─────────────────────────────────────────────
router.get("/filtros", filtrosDisponibles);

// ─────────────────────────────────────────────
//  GET /api/buscar/negocios
//  Búsqueda de talleres con filtros y paginación
//
//  Query params:
//   q          → texto libre (nombre, descripción)
//   categoria  → categoría del taller
//   ciudad     → ciudad del taller
//   valoracion → valoración mínima (0-5)
//   ordenar    → valoracion | reseñas | nuevo | nombre
//   pagina     → número de página (default: 1)
//   limite     → items por página (default: 12, max: 50)
// ─────────────────────────────────────────────
router.get("/negocios", rateLimitBusqueda, searchNegocios);

module.exports = router;

// ─────────────────────────────────────────────
//  TRACKING: las rutas GET de búsqueda registran
//  eventos de analytics automáticamente.
//
//  Para activar, añade el middleware track() a las rutas:
//
//  const { track } = require("../middleware/tracking");
//
//  router.get("/",            rateLimitBusqueda, track("search", (req) => ({
//    query:      req.query.q,
//    filtros:    req.query,
//    resultados: 0, // Se actualiza en el controller
//  })), searchProductos);
//
//  router.get("/sugerencias", rateLimitBusqueda, track("search"), sugerencias);
// ─────────────────────────────────────────────
