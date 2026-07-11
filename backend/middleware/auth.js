/**
 * ConnectModa – Middleware de Autenticación y Autorización
 */

const jwt      = require("jsonwebtoken");
const mongoose = require("mongoose");

const JWT_SECRET = process.env.JWT_SECRET || "changeme";

// ─── verificarToken — cualquier usuario autenticado ───────────────────────────

const verificarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token      = authHeader?.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ ok: false, mensaje: "Token requerido" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Asegurar que _id sea compatible con ObjectId de Mongoose
    req.usuario = {
      ...payload,
      _id: new mongoose.Types.ObjectId(payload.id || payload._id),
      id:  (payload.id || payload._id).toString(),
    };

    next();
  } catch (err) {
    const mensaje = err.name === "TokenExpiredError"
      ? "Token expirado"
      : "Token inválido";
    return res.status(401).json({ ok: false, mensaje });
  }
};

// ─── soloAdmin — solo rol admin ───────────────────────────────────────────────

const soloAdmin = (req, res, next) => {
  if (req.usuario?.rol !== "admin") {
    return res.status(403).json({ ok: false, mensaje: "Acceso restringido a administradores" });
  }
  next();
};

// ─── soloRol — rol específico o lista de roles ────────────────────────────────

const soloRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuario?.rol)) {
    return res.status(403).json({
      ok:      false,
      mensaje: `Acceso restringido. Roles permitidos: ${roles.join(", ")}`,
    });
  }
  next();
};

// ─── soloVerificado — email verificado ───────────────────────────────────────

const soloVerificado = (req, res, next) => {
  if (!req.usuario?.verificado) {
    return res.status(403).json({
      ok:      false,
      mensaje: "Debes verificar tu correo electrónico para acceder a esta función",
    });
  }
  next();
};

// ─── soloPropio — solo el dueño del recurso o un admin ───────────────────────
// Uso: router.delete("/:id", verificarToken, soloPropio("id"), ctrl.eliminar)

const soloPropio = (paramName = "id") => (req, res, next) => {
  const recursoId = req.params[paramName];
  const esAdmin   = req.usuario?.rol === "admin";
  const esPropio  = recursoId === req.usuario?.id;

  if (!esAdmin && !esPropio) {
    return res.status(403).json({ ok: false, mensaje: "No tienes permiso para modificar este recurso" });
  }
  next();
};

// ─── opcional — adjunta usuario si hay token, pero no falla si no hay ─────────

const opcional = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token      = authHeader?.split(" ")[1];

  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = {
      ...payload,
      _id: new mongoose.Types.ObjectId(payload.id || payload._id),
      id:  (payload.id || payload._id).toString(),
    };
  } catch (_) {
    // Token inválido → ignorar silenciosamente
  }
  next();
};

module.exports = {
  verificarToken,
  soloAdmin,
  soloRol,
  soloVerificado,
  soloPropio,
  opcional,
};
