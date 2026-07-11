/**
 * ConnectModa – Auth Controller
 * Registro, login, refresh, perfil, verificación de email, reset de password
 */

const crypto   = require("crypto");
const jwt      = require("jsonwebtoken");
const Usuario  = require("../models/Usuario");
const { ok, fail } = require("../utils/apiResponse");
const { enviarVerificacionEmail, enviarResetPassword } = require("../utils/email");

const JWT_SECRET          = process.env.JWT_SECRET          || "changeme";
const JWT_EXPIRES         = process.env.JWT_EXPIRES         || "7d";
const REFRESH_EXPIRES     = process.env.JWT_REFRESH_EXPIRES || "30d";
const FRONTEND_URL        = process.env.FRONTEND_URL        || "http://localhost:5500";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generarTokens(payload) {
  const accessToken  = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  const refreshToken = jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_EXPIRES });
  return { accessToken, refreshToken };
}

function tokenVerificacionHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── Registro ─────────────────────────────────────────────────────────────────

exports.registro = async (req, res) => {
  try {
    const { nombre, apellido, email, password, rol } = req.body;

    const existe = await Usuario.findOne({ email });
    if (existe) return fail(res, "El email ya está registrado", 409);

    // Generar token de verificación de email
    const tokenPlano  = crypto.randomBytes(32).toString("hex");
    const tokenHashed = tokenVerificacionHash(tokenPlano);

    const usuario = await Usuario.create({
      nombre,
      apellido: apellido || "",
      email,
      password,
      rol:                 rol || "comprador",
      tokenVerificacion:   tokenHashed,
      verificado:          false,
    });

    // Enviar email de verificación (no bloqueante)
    const urlVerificacion = `${FRONTEND_URL}/verificar-email?token=${tokenPlano}`;
    enviarVerificacionEmail(email, { nombre, urlVerificacion }).catch(() => {});

    const tokens = generarTokens({ id: usuario._id, rol: usuario.rol, verificado: false });

    return ok(res, {
      usuario: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, verificado: false },
      ...tokens,
      aviso: "Revisa tu correo para verificar tu cuenta",
    }, "Registro exitoso", 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const usuario = await Usuario.findOne({ email }).select("+password");
    if (!usuario) return fail(res, "Credenciales inválidas", 401);

    if (usuario.estaBloqueado()) {
      const minutos = Math.ceil((usuario.bloqueadoHasta - Date.now()) / 60000);
      return fail(res, `Cuenta bloqueada. Intenta en ${minutos} minuto(s)`, 423);
    }

    const valido = await usuario.compararPassword(password);
    if (!valido) {
      await usuario.registrarIntentoFallido();
      const restantes = Math.max(0, 5 - usuario.intentosFallidos);
      return fail(res, `Credenciales inválidas. ${restantes} intento(s) restante(s)`, 401);
    }

    if (usuario.estado !== "activo") {
      return fail(res, "Cuenta desactivada. Contacta soporte.", 403);
    }

    await usuario.limpiarIntentos();

    const tokens = generarTokens({ id: usuario._id, rol: usuario.rol, verificado: usuario.verificado });

    // Guardar refresh token hasheado
    usuario.refreshToken = crypto.createHash("sha256").update(tokens.refreshToken).digest("hex");
    await usuario.save({ validateBeforeSave: false });

    return ok(res, {
      usuario: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, verificado: usuario.verificado },
      ...tokens,
    }, "Login exitoso");
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Refresh token ────────────────────────────────────────────────────────────

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return fail(res, "Refresh token requerido", 400);

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_SECRET);
    } catch {
      return fail(res, "Token inválido o expirado", 401);
    }

    const tokenHashed = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const usuario = await Usuario.findOne({ _id: payload.id, refreshToken: tokenHashed });
    if (!usuario || usuario.estado !== "activo") return fail(res, "Token revocado", 401);

    const tokens = generarTokens({ id: usuario._id, rol: usuario.rol, verificado: usuario.verificado });

    // Rotar refresh token
    usuario.refreshToken = crypto.createHash("sha256").update(tokens.refreshToken).digest("hex");
    await usuario.save({ validateBeforeSave: false });

    return ok(res, tokens, "Token renovado");
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

exports.logout = async (req, res) => {
  try {
    await Usuario.findByIdAndUpdate(req.usuario._id, { refreshToken: null });
    return ok(res, null, "Sesión cerrada correctamente");
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Perfil ───────────────────────────────────────────────────────────────────

exports.perfil = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario._id).select("-password");
    if (!usuario) return fail(res, "Usuario no encontrado", 404);
    return ok(res, usuario);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Cambiar contraseña ───────────────────────────────────────────────────────

exports.cambiarPassword = async (req, res) => {
  try {
    const { passwordActual, passwordNuevo } = req.body;
    const usuario = await Usuario.findById(req.usuario._id).select("+password");

    const valido = await usuario.compararPassword(passwordActual);
    if (!valido) return fail(res, "Contraseña actual incorrecta", 400);

    usuario.password = passwordNuevo;
    usuario.refreshToken = null; // Invalidar sesiones activas
    await usuario.save();

    return ok(res, null, "Contraseña actualizada. Por seguridad, vuelve a iniciar sesión.");
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Verificar email — GET /api/auth/verificar-email?token=xxx ────────────────

exports.verificarEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return fail(res, "Token requerido", 400);

    const tokenHashed = tokenVerificacionHash(token);
    const usuario = await Usuario.findOne({ tokenVerificacion: tokenHashed });

    if (!usuario) return fail(res, "Token inválido o ya utilizado", 400);
    if (usuario.verificado) return ok(res, null, "Email ya verificado anteriormente");

    usuario.verificado          = true;
    usuario.verificadoEn        = new Date();
    usuario.tokenVerificacion   = undefined;
    await usuario.save({ validateBeforeSave: false });

    return ok(res, null, "Email verificado correctamente. Ya puedes usar todas las funciones.");
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Reenviar verificación — POST /api/auth/reenviar-verificacion ─────────────

exports.reenviarVerificacion = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario._id);
    if (!usuario) return fail(res, "Usuario no encontrado", 404);
    if (usuario.verificado) return fail(res, "Tu email ya está verificado", 400);

    const tokenPlano  = crypto.randomBytes(32).toString("hex");
    usuario.tokenVerificacion = tokenVerificacionHash(tokenPlano);
    await usuario.save({ validateBeforeSave: false });

    const urlVerificacion = `${FRONTEND_URL}/verificar-email?token=${tokenPlano}`;
    await enviarVerificacionEmail(usuario.email, { nombre: usuario.nombre, urlVerificacion });

    return ok(res, null, "Correo de verificación reenviado");
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Solicitar reset password — POST /api/auth/forgot-password ───────────────

exports.solicitarResetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    // Siempre responder igual (no revelar si el email existe)
    const respuesta = "Si ese email está registrado, recibirás instrucciones en unos minutos.";

    const usuario = await Usuario.findOne({ email });
    if (!usuario) return ok(res, null, respuesta);

    const tokenPlano = await usuario.generarTokenReset();
    const urlReset   = `${FRONTEND_URL}/reset-password?token=${tokenPlano}`;

    await enviarResetPassword(email, { nombre: usuario.nombre, urlReset });

    return ok(res, null, respuesta);
  } catch (err) {
    return fail(res, err.message, 500);
  }
};

// ─── Resetear password — POST /api/auth/reset-password ───────────────────────

exports.resetPassword = async (req, res) => {
  try {
    const { token, passwordNuevo } = req.body;
    if (!token || !passwordNuevo) return fail(res, "Token y nueva contraseña requeridos", 400);

    const tokenHashed = crypto.createHash("sha256").update(token).digest("hex");
    const usuario = await Usuario.findOne({
      tokenResetPassword:  tokenHashed,
      expiraResetPassword: { $gt: new Date() },
    });

    if (!usuario) return fail(res, "Token inválido o expirado. Solicita uno nuevo.", 400);

    usuario.password             = passwordNuevo;
    usuario.tokenResetPassword   = undefined;
    usuario.expiraResetPassword  = undefined;
    usuario.intentosFallidos     = 0;
    usuario.bloqueadoHasta       = null;
    usuario.refreshToken         = null; // Invalidar todas las sesiones activas
    await usuario.save();

    return ok(res, null, "Contraseña restablecida correctamente. Ya puedes iniciar sesión.");
  } catch (err) {
    return fail(res, err.message, 500);
  }
};
