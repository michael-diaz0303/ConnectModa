/**
 * ConnectModa – Rutas de Pagos (Wompi)
 * Base: /api/pagos
 */

const express = require("express");
const router  = express.Router();

const {
  iniciarPago,
  confirmarPago,
  listarPagos,
  listarBancosPSE,
  obtenerReciboPago,
} = require("../controllers/pagoController");

const { verificarToken, soloAdmin } = require("../middleware/auth");

router.use(verificarToken);

// POST /api/pagos/iniciar
// Genera referencia y datos para el widget Wompi
// Body: { ordenId }
router.post("/iniciar", iniciarPago);

// POST /api/pagos/confirmar
// El frontend llama esto tras completar el widget Wompi
// Body: { wompiTransactionId, referencia }
router.post("/confirmar", confirmarPago);

// GET /api/pagos/bancos-pse
// Lista de bancos disponibles para PSE
router.get("/bancos-pse", listarBancosPSE);

// GET /api/pagos [Admin / Emprendedor]
// Listar transacciones con filtros
router.get("/", soloAdmin, listarPagos);

// GET /api/pagos/recibo/:ordenId
// Descargar recibo PDF
router.get("/recibo/:ordenId", obtenerReciboPago);

module.exports = router;
