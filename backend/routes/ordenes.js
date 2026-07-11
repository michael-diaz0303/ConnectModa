/**
 * ConnectModa – Rutas de Órdenes
 * Base: /api/ordenes
 */

const express = require("express");
const router  = express.Router();

const {
  crearOrden,
  obtenerOrdenes,
  obtenerOrdenPorId,
  actualizarEstadoOrden,
  cancelarOrden,
} = require("../controllers/ordenController");

const { verificarToken, soloAdmin } = require("../middleware/auth");

// Todas las rutas de órdenes requieren autenticación
router.use(verificarToken);

// ─────────────────────────────────────────────
//  POST /api/ordenes
//  Crear nueva orden desde el carrito del usuario
//
//  Body: {
//    metodo_pago: "tarjeta" | "transferencia" | "efectivo",
//    direccion_envio: { calle, numero, ciudad, pais, cp },
//    notas: string (opcional)
//  }
// ─────────────────────────────────────────────
router.post("/", crearOrden);

// ─────────────────────────────────────────────
//  GET /api/ordenes
//  Listar órdenes del usuario autenticado
//  Admin/Emprendedor ven todas las órdenes
//
//  Query params:
//   estado  → filtrar por estado
//   pagina  → página (default: 1)
//   limite  → items por página (default: 10, max: 50)
// ─────────────────────────────────────────────
router.get("/", obtenerOrdenes);

// ─────────────────────────────────────────────
//  GET /api/ordenes/:id
//  Detalle de una orden (debe pertenecer al usuario)
// ─────────────────────────────────────────────
router.get("/:id", obtenerOrdenPorId);

// ─────────────────────────────────────────────
//  PATCH /api/ordenes/:id
//  Actualizar estado — Solo ADMIN / EMPRENDEDOR
//
//  Body: {
//    estado: "procesando" | "pagado" | "enviado" | "entregado" | "cancelado",
//    nota: string (opcional, para auditoría)
//  }
// ─────────────────────────────────────────────
router.patch("/:id", soloAdmin, actualizarEstadoOrden);

// ─────────────────────────────────────────────
//  POST /api/ordenes/:id/cancelar
//  Cancelar orden (solo si está en pendiente/procesando)
//  Devuelve stock a productos
//
//  Body: { motivo: string (opcional) }
// ─────────────────────────────────────────────
router.post("/:id/cancelar", cancelarOrden);

module.exports = router;
