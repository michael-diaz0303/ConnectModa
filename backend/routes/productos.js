/**
 * ConnectModa – Rutas de Productos
 * Muestra la composición de middlewares: auth → caché → controller
 * Base: /api/productos
 */

const express = require("express");
const router  = express.Router();

const {
  listarProductos,
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  listarCategorias,
  estadoCache,
  vaciarCache,
} = require("../controllers/productoController");

const { verificarToken, soloAdmin } = require("../middleware/auth");

const {
  cacheProductos,
  cacheProducto,
  cacheCategorias,
} = require("../middleware/cache");

// ─────────────────────────────────────────────
//  GET /api/productos
//  Composición: cacheProductos → listarProductos
//  Si hay HIT en Redis, listarProductos nunca se ejecuta.
//
//  Query params: pagina, limite, categoria, vendedor
// ─────────────────────────────────────────────
router.get("/", cacheProductos, listarProductos);

// ─────────────────────────────────────────────
//  GET /api/productos/:id
//  Composición: cacheProducto → obtenerProductoPorId
// ─────────────────────────────────────────────
router.get("/:id", cacheProducto, obtenerProductoPorId);

// ─────────────────────────────────────────────
//  POST /api/productos
//  Crear producto — requiere auth
//  Controller invalida: listas + búsquedas + categorías
// ─────────────────────────────────────────────
router.post("/", verificarToken, crearProducto);

// ─────────────────────────────────────────────
//  PUT /api/productos/:id
//  Actualizar producto — requiere ser dueño o admin
//  Controller invalida: producto + listas + búsquedas
// ─────────────────────────────────────────────
router.put("/:id", verificarToken, actualizarProducto);

// ─────────────────────────────────────────────
//  DELETE /api/productos/:id
//  Eliminar producto (soft delete) — requiere ser dueño o admin
//  Controller invalida: todo lo relacionado
// ─────────────────────────────────────────────
router.delete("/:id", verificarToken, eliminarProducto);

module.exports = router;


// ─────────────────────────────────────────────────────────────────────────────
//  RUTAS SEPARADAS (registrar en server.js individualmente):
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Categorías — /api/categorias
 * Exportar por separado para registrar en server.js como:
 *   app.use("/api/categorias", categoriasRouter);
 */
const categoriasRouter = express.Router();
categoriasRouter.get("/", cacheCategorias, listarCategorias);

/**
 * Cache Admin — /api/cache
 * Solo admin puede ver estadísticas o limpiar
 */
const cacheRouter = express.Router();
cacheRouter.use(verificarToken);
cacheRouter.get("/stats",   estadoCache);   // GET /api/cache/stats
cacheRouter.delete("/",     vaciarCache);   // DELETE /api/cache?tipo=todo

module.exports.categoriasRouter = categoriasRouter;
module.exports.cacheRouter      = cacheRouter;
