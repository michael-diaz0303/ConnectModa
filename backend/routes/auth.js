/**
 * ConnectModa – Rutas de autenticación
 * Base: /api/auth
 */

const router   = require("express").Router();
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { verificarToken } = require("../middleware/auth");
const ctrl     = require("../controllers/authController");

// ── Validaciones reutilizables ─────────────────────────────────────────────────

const reglasPassword = (campo = "password") => [
  body(campo)
    .isLength({ min: 8 }).withMessage("Mínimo 8 caracteres")
    .matches(/[A-Z]/).withMessage("Debe tener al menos una mayúscula")
    .matches(/[0-9]/).withMessage("Debe tener al menos un número"),
];

const reglasRegistro = [
  body("nombre").trim().notEmpty().withMessage("El nombre es requerido"),
  body("apellido").trim().notEmpty().withMessage("El apellido es requerido"),
  body("email").isEmail().normalizeEmail().withMessage("Email inválido"),
  ...reglasPassword("password"),
  body("rol").optional().isIn(["comprador", "emprendedor", "admin"]).withMessage("Rol inválido"),
];

const reglasLogin = [
  body("email").isEmail().normalizeEmail().withMessage("Email inválido"),
  body("password").notEmpty().withMessage("La contraseña es requerida"),
];

// ── Rutas públicas ─────────────────────────────────────────────────────────────

router.post("/registro",  reglasRegistro,                       validate, ctrl.registro);
router.post("/login",     reglasLogin,                          validate, ctrl.login);
router.post("/refresh",   body("refreshToken").notEmpty(),      validate, ctrl.refreshToken);
router.get ("/verificar-email",                                           ctrl.verificarEmail);
router.post("/forgot-password",
  body("email").isEmail().normalizeEmail(),
  validate,
  ctrl.solicitarResetPassword
);
router.post("/reset-password",
  [
    body("token").notEmpty().withMessage("Token requerido"),
    ...reglasPassword("passwordNuevo"),
  ],
  validate,
  ctrl.resetPassword
);

// ── Rutas protegidas ───────────────────────────────────────────────────────────

router.post("/logout",    verificarToken, ctrl.logout);
router.get ("/perfil",    verificarToken, ctrl.perfil);
router.put ("/password",
  verificarToken,
  [
    body("passwordActual").notEmpty().withMessage("Contraseña actual requerida"),
    ...reglasPassword("passwordNuevo"),
  ],
  validate,
  ctrl.cambiarPassword
);
router.post("/reenviar-verificacion", verificarToken, ctrl.reenviarVerificacion);

module.exports = router;
