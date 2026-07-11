const express  = require('express');
const { body, param, query } = require('express-validator');

const negocioController = require('../controllers/negocioController');
const validate          = require('../middleware/validate');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ── VALIDACIONES ──────────────────────────────────────────────────────────────
const validarCreacion = [
  body('nombre')
    .trim().notEmpty().withMessage('El nombre es obligatorio.')
    .isLength({ min: 2, max: 100 }).withMessage('Nombre debe tener entre 2 y 100 caracteres.'),
  body('categoria')
    .notEmpty().withMessage('La categoría es obligatoria.')
    .isIn(['ropa','calzado','accesorios','confeccion','telas','otro'])
    .withMessage('Categoría inválida.'),
  body('contacto.correo')
    .optional()
    .isEmail().withMessage('Formato de correo inválido.'),
  body('contacto.telefono')
    .optional()
    .isMobilePhone('es-CO').withMessage('Número de teléfono inválido.'),
];

const validarId = [
  param('id').isMongoId().withMessage('ID de negocio inválido.'),
];

// ── RUTAS PÚBLICAS ────────────────────────────────────────────────────────────

// GET /api/v1/negocios
router.get('/',           negocioController.getNegocios);

// GET /api/v1/negocios/categorias
router.get('/categorias', negocioController.getCategorias);

// GET /api/v1/negocios/:id
router.get('/:id', validarId, validate, negocioController.getNegocioById);

// ── RUTAS PROTEGIDAS (requieren autenticación de admin) ───────────────────────
// Nota: el middleware 'auth' se añadirá en server.js o aquí cuando se implemente JWT

// POST /api/v1/negocios
router.post('/',    validarCreacion, validate, negocioController.createNegocio);

// PUT /api/v1/negocios/:id
router.put('/:id',  validarId, validate, negocioController.updateNegocio);

// DELETE /api/v1/negocios/:id
router.delete('/:id', validarId, validate, negocioController.deleteNegocio);

module.exports = router;