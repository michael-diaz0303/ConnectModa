/**
 * ConnectModa – Rutas de Upload
 * Base: /api/upload
 *
 * Todas las rutas requieren autenticación JWT.
 * El flujo es: auth → multer (memoria) → validar → Sharp → S3 → BD
 */

const express = require("express");
const router  = express.Router();

const {
  uploadProductoImage,
  uploadAvatarUsuario,
  eliminarImagen,
  obtenerPresignedURL,
} = require("../controllers/uploadController");

const { verificarToken }              = require("../middleware/auth");
const { subirMultiple, subirAvatar, requireFile } = require("../middleware/upload");

// Todas las rutas de upload requieren autenticación
router.use(verificarToken);

// ─────────────────────────────────────────────
//  POST /api/upload/producto
//  Subir imágenes de un producto (hasta 8)
//
//  Body (multipart/form-data):
//    imagenes[]       → archivos (jpg/png/webp, máx 10MB c/u)
//    productoId       → (opcional) asociar al producto
//    reemplazar_index → (opcional) reemplazar imagen en posición N
//
//  Respuesta:
//    { ok, imagenes: [{ index, thumb, medium, full, url }] }
// ─────────────────────────────────────────────
router.post(
  "/producto",
  subirMultiple,
  requireFile,
  uploadProductoImage
);

// ─────────────────────────────────────────────
//  POST /api/upload/avatar
//  Subir o reemplazar avatar del usuario autenticado
//
//  Body (multipart/form-data):
//    avatar → archivo (jpg/png/webp, máx 10MB)
//
//  Respuesta:
//    { ok, avatar: "https://cdn.connectmoda.co/..." }
// ─────────────────────────────────────────────
router.post(
  "/avatar",
  subirAvatar,
  requireFile,
  uploadAvatarUsuario
);

// ─────────────────────────────────────────────
//  DELETE /api/upload/producto/:productoId/imagen/:index
//  Eliminar una imagen específica de un producto
//  :index → posición en el array (0-7)
//
//  Respuesta:
//    { ok, mensaje, imagenesRestantes }
// ─────────────────────────────────────────────
router.delete(
  "/producto/:productoId/imagen/:index",
  eliminarImagen
);

// ─────────────────────────────────────────────
//  GET /api/upload/presigned
//  Obtener URL temporal firmada para archivos privados
//
//  Query params:
//    key → key S3 del archivo (ej: "conectmoda/reportes/abc.pdf")
//    ttl → segundos de validez (default 3600, máx 86400)
//
//  Respuesta:
//    { ok, url, expiraEn }
// ─────────────────────────────────────────────
router.get("/presigned", obtenerPresignedURL);

module.exports = router;
