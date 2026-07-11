/**
 * ConnectModa – Rutas de IA
 * Base: /api/ia
 */

const express = require("express");
const router  = express.Router();

const {
  obtenerRecomendaciones,
  entenderPreferencias,
  chatConsultor,
  obtenerHistorialChat,
} = require("../controllers/iaController");

const { verificarToken } = require("../middleware/auth");

// Todas las rutas de IA requieren autenticación
router.use(verificarToken);

// ─────────────────────────────────────────────
//  GET /api/ia/recomendaciones
//  Obtener top 10 productos recomendados para el usuario
//  Usa Redis 24h. Forzar regeneración con ?forzar=1
//
//  Flujo: perfil usuario → catálogo → IA → Redis → respuesta
// ─────────────────────────────────────────────
router.get("/recomendaciones", obtenerRecomendaciones);

// ─────────────────────────────────────────────
//  POST /api/ia/entender-preferencias
//  El usuario describe su estilo en texto libre
//  Body: { descripcion: "Me gustan los vestidos casuales..." }
//
//  La IA categoriza y actualiza el perfil automáticamente
// ─────────────────────────────────────────────
router.post("/entender-preferencias", entenderPreferencias);

// ─────────────────────────────────────────────
//  POST /api/ia/consultor
//  Chat con el asesor de moda IA
//  Body: { mensaje: "Busco vestido para boda", sesionId: "uuid" }
//
//  Responde con texto + lista de productos relevantes del catálogo
// ─────────────────────────────────────────────
router.post("/consultor", chatConsultor);

// ─────────────────────────────────────────────
//  GET /api/ia/consultor/historial
//  Listar sesiones de chat del usuario
//  Query: sesionId (opcional, para ver una sesión específica)
//         pagina, limite
// ─────────────────────────────────────────────
router.get("/consultor/historial", obtenerHistorialChat);

module.exports = router;
