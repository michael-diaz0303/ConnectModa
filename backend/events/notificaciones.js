/**
 * ConnectModa – Eventos de Notificaciones
 * Maneja todos los eventos de negocio del namespace principal
 * Namespace: / (default)
 */

const sm = require("../utils/socketManager");
const { puedeUnirseASala } = require("../middleware/socketAuth");

// ─────────────────────────────────────────────
//  Rate limiting de mensajes por socket
// ─────────────────────────────────────────────
const rateLimits = new Map(); // socketId → { count, inicio }
const MAX_EVENTOS_POR_MIN = 60;

function checkMsgRateLimit(socketId) {
  const ahora = Date.now();
  const datos  = rateLimits.get(socketId) || { count: 0, inicio: ahora };
  if (ahora - datos.inicio > 60000) { datos.count = 0; datos.inicio = ahora; }
  datos.count++;
  rateLimits.set(socketId, datos);
  return datos.count <= MAX_EVENTOS_POR_MIN;
}

// ─────────────────────────────────────────────
//  HANDLER PRINCIPAL
// ─────────────────────────────────────────────
function registrarEventosNotificaciones(socket) {
  const { usuario } = socket;

  log("info", "nueva_conexion", {
    socketId: socket.id,
    usuarioId: usuario._id,
    rol:       usuario.rol,
  });

  // ── Registrar conexión en el manager ─────────────────────
  sm.registrarConexion(usuario._id.toString(), socket.id);

  // ── Unir a sala personal automáticamente ─────────────────
  socket.join(`user:${usuario._id}`);

  // ── Unir a sala de admin si corresponde ──────────────────
  if (["admin", "emprendedor"].includes(usuario.rol)) {
    socket.join("admin:general");
    log("info", "admin_conectado", { usuarioId: usuario._id, rol: usuario.rol });
  }

  // Confirmar conexión exitosa al cliente
  socket.emit("connected", {
    socketId:    socket.id,
    usuarioId:   usuario._id,
    nombre:      usuario.nombre,
    sala:        `user:${usuario._id}`,
    esAdmin:     ["admin", "emprendedor"].includes(usuario.rol),
    ts:          Date.now(),
  });

  // ── join:room — unirse a sala con validación ──────────────
  socket.on("join:room", ({ sala } = {}) => {
    if (!sala || typeof sala !== "string") return;

    const salaSegura = sala.trim().substring(0, 100);

    if (!puedeUnirseASala(socket, salaSegura)) {
      socket.emit("error:room", { mensaje: "No tienes permisos para unirte a esta sala", sala: salaSegura });
      return;
    }

    socket.join(salaSegura);
    socket.emit("room:joined", { sala: salaSegura, ts: Date.now() });
    log("info", "join_room", { socketId: socket.id, usuarioId: usuario._id, sala: salaSegura });
  });

  // ── leave:room ────────────────────────────────────────────
  socket.on("leave:room", ({ sala } = {}) => {
    if (!sala || typeof sala !== "string") return;
    socket.leave(sala.trim());
    socket.emit("room:left", { sala: sala.trim(), ts: Date.now() });
  });

  // ── ping / heartbeat ──────────────────────────────────────
  socket.on("ping:client", () => {
    socket.emit("pong:server", { ts: Date.now() });
  });

  // ── Desconexión ───────────────────────────────────────────
  socket.on("disconnect", (motivo) => {
    sm.registrarDesconexion(usuario._id.toString(), socket.id);
    rateLimits.delete(socket.id);
    log("info", "desconexion", { socketId: socket.id, usuarioId: usuario._id, motivo });
  });

  // ── Manejo de errores del socket ──────────────────────────
  socket.on("error", (err) => {
    log("error", "socket_error", { socketId: socket.id, error: err.message });
  });
}

function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "EventosNotif", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

module.exports = { registrarEventosNotificaciones, checkMsgRateLimit };
