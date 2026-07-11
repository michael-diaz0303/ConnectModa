/**
 * ConnectModa – Rutas de Reseñas
 * Base: /api/resenas
 */

const express  = require("express");
const router   = express.Router();
const { body } = require("express-validator");

const ctrl     = require("../controllers/resenaController");
const { verificarToken, soloAdmin, opcional } = require("../middleware/auth");
const validate = require("../middleware/validate");

const reglasCrear = [
  body("negocioId").notEmpty().withMessage("negocioId es requerido"),
  body("calificacion")
    .isInt({ min: 1, max: 5 })
    .withMessage("La calificación debe ser entre 1 y 5"),
  body("comentario")
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage("El comentario debe tener entre 10 y 1000 caracteres"),
];

// POST /api/resenas — usuario autenticado o anónimo con nombre/correo
router.post("/", opcional, reglasCrear, validate, ctrl.crear);

// GET /api/resenas/:negocioId — público, admin ve todas
router.get("/:negocioId", opcional, ctrl.listarPorNegocio);

// PATCH /api/resenas/:id/moderar — solo admin
router.patch("/:id/moderar",
  verificarToken,
  soloAdmin,
  body("aprobar").isBoolean().withMessage("aprobar debe ser true o false"),
  validate,
  ctrl.moderar
);

// DELETE /api/resenas/:id — autor o admin
router.delete("/:id", verificarToken, ctrl.eliminar);

module.exports = router;
