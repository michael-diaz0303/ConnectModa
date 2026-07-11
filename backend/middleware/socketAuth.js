/**
 * ConnectModa – Middleware de Autenticación para Socket.io
 * Verifica el JWT en el handshake antes de permitir la conexión
 */

const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────
//  Rate limiter por IP para conexiones socket
// ─────────────────────────────────────────────
const conexionesPorIP = new Map();
const MAX_CONEXIONES_IP = 10;     // Máximo 10 sockets por IP simultáneos
const VENTANA_CONN_MS  = 60000;   // Ventana de 1 minuto

function checkConnectionRateLimit(ip) {
  const ahora = Date.now();
  const datos  = conexionesPorIP.get(ip) || { count: 0, inicio: ahora };

  if (ahora - datos.inicio > VENTANA_CONN_MS) {
    datos.count = 0;
    datos.inicio = ahora;
  }
  datos.count++;
  conexionesPorIP.set(ip, datos);

  return datos.count <= MAX_CONEXIONES_IP;
}

// Limpiar mapa cada 5 min
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, datos] of conexionesPorIP.entries()) {
    if (ahora - datos.inicio > VENTANA_CONN_MS * 5) conexionesPorIP.delete(ip);
  }
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────
//  MIDDLEWARE PRINCIPAL
// ─────────────────────────────────────────────
function socketAuth(socket, next) {
  try {
    // Extraer IP real (considera proxies/load balancers)
    const ip =
      socket.handshake.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      socket.handshake.address;

    // Rate limit de conexiones por IP
    if (!checkConnectionRateLimit(ip)) {
      return next(new Error("RATE_LIMIT: Demasiadas conexiones desde esta IP"));
    }

    // Extraer token: primero query param, luego header Authorization
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("AUTH_REQUIRED: Token de autenticación requerido"));
    }

    // Verificar JWT
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Adjuntar datos del usuario al socket para uso posterior
    socket.usuario = {
      _id:    payload._id || payload.id,
      nombre: payload.nombre,
      email:  payload.email,
      rol:    payload.rol || "cliente",
    };
    socket.ipCliente = ip;

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new Error("AUTH_EXPIRED: Token expirado"));
    }
    if (err.name === "JsonWebTokenError") {
      return next(new Error("AUTH_INVALID: Token inválido"));
    }
    return next(new Error(`AUTH_ERROR: ${err.message}`));
  }
}

// ─────────────────────────────────────────────
//  Middleware para validar permisos de sala
// ─────────────────────────────────────────────
function puedeUnirseASala(socket, sala) {
  const { usuario } = socket;

  // Sala personal del usuario — solo el propio usuario
  if (sala.startsWith(`user:${usuario._id}`)) return true;

  // Sala de admin — solo admins/emprendedores
  if (sala.startsWith("admin:")) {
    return ["admin", "emprendedor"].includes(usuario.rol);
  }

  // Sala de chat — cualquier usuario autenticado
  if (sala.startsWith("chat:")) return true;

  // Sala de orden — verificar que el usuario sea parte de la orden
  // (la verificación real se hace en el handler de eventos)
  if (sala.startsWith("orden:")) return true;

  return false;
}

module.exports = { socketAuth, puedeUnirseASala };
