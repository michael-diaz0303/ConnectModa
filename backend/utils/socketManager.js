/**
 * ConnectModa – Socket Manager
 * Gestión centralizada de conexiones, salas y broadcasting
 * Singleton que se inicializa una vez y se reutiliza en toda la app
 */

const { puedeUnirseASala } = require("../middleware/socketAuth");

// ─────────────────────────────────────────────
//  Estado en memoria
// ─────────────────────────────────────────────
/** @type {Map<string, Set<string>>}  usuarioId → Set de socketIds */
const usuariosConectados = new Map();

/** @type {import("socket.io").Server | null} */
let _io = null;

// ─────────────────────────────────────────────
//  INICIALIZACIÓN
// ─────────────────────────────────────────────
function init(io) {
  _io = io;
}

function getIO() {
  if (!_io) throw new Error("[SocketManager] No inicializado. Llama init(io) primero.");
  return _io;
}

// ─────────────────────────────────────────────
//  HELPERS DE ESTADO
// ─────────────────────────────────────────────
function registrarConexion(usuarioId, socketId) {
  if (!usuariosConectados.has(usuarioId)) {
    usuariosConectados.set(usuarioId, new Set());
  }
  usuariosConectados.get(usuarioId).add(socketId);
  log("info", "conectado", { usuarioId, socketId, totalSockets: usuariosConectados.get(usuarioId).size });
}

function registrarDesconexion(usuarioId, socketId) {
  const sockets = usuariosConectados.get(usuarioId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) usuariosConectados.delete(usuarioId);
  }
  log("info", "desconectado", { usuarioId, socketId });
}

function estaConectado(usuarioId) {
  return usuariosConectados.has(usuarioId) && usuariosConectados.get(usuarioId).size > 0;
}

function totalConectados() {
  return usuariosConectados.size;
}

// ─────────────────────────────────────────────
//  BROADCASTING
// ─────────────────────────────────────────────

/** Enviar evento a TODOS los sockets de un usuario específico */
function emitirAUsuario(usuarioId, evento, datos) {
  getIO().to(`user:${usuarioId}`).emit(evento, { ...datos, ts: Date.now() });
}

/** Enviar evento a todos los admins conectados */
function emitirAAdmins(evento, datos) {
  getIO().to("admin:general").emit(evento, { ...datos, ts: Date.now() });
}

/** Broadcast global a todos los conectados */
function emitirGlobal(evento, datos) {
  getIO().emit(evento, { ...datos, ts: Date.now() });
}

/** Enviar a una sala específica */
function emitirASala(sala, evento, datos) {
  getIO().to(sala).emit(evento, { ...datos, ts: Date.now() });
}

// ─────────────────────────────────────────────
//  NOTIFICACIONES DE NEGOCIO
//  Estas funciones se llaman desde los controllers
// ─────────────────────────────────────────────

/** Notificar al comprador cuando se crea su orden */
function notificarOrdenCreada(usuarioId, orden) {
  emitirAUsuario(usuarioId, "order:created", {
    ordenId:  orden._id,
    total:    orden.total?.total,
    estado:   orden.estado,
    items:    orden.items?.length,
    mensaje:  "Tu orden fue creada exitosamente",
  });
  // Notificar también a los admins
  emitirAAdmins("admin:order:new", {
    ordenId:   orden._id,
    usuarioId,
    total:     orden.total?.total,
  });
}

/** Notificar cambio de estado de una orden */
function notificarCambioEstadoOrden(usuarioId, orden, estadoAnterior) {
  const mensajes = {
    procesando: "Tu pedido está siendo procesado",
    pagado:     "¡Tu pago fue confirmado!",
    enviado:    `Tu pedido está en camino 🚚 Seguimiento: ${orden.numero_seguimiento || "—"}`,
    entregado:  "¡Tu pedido fue entregado! 🎉",
    cancelado:  "Tu pedido fue cancelado",
  };

  emitirAUsuario(usuarioId, "order:status_changed", {
    ordenId:         orden._id,
    estadoAnterior,
    estadoNuevo:     orden.estado,
    numeroSeguimiento: orden.numero_seguimiento,
    mensaje:         mensajes[orden.estado] || `Estado actualizado: ${orden.estado}`,
  });
}

/** Notificar pago confirmado */
function notificarPagoConfirmado(usuarioId, datos) {
  emitirAUsuario(usuarioId, "payment:confirmed", {
    ordenId:   datos.ordenId,
    monto:     datos.monto,
    montoFmt:  datos.montoFmt,
    mensaje:   "Pago procesado exitosamente",
  });
}

/** Notificar al vendedor que vendió un producto */
function notificarProductoVendido(vendedorId, datos) {
  emitirAUsuario(vendedorId, "product:sold", {
    productoId:    datos.productoId,
    nombreProducto: datos.nombreProducto,
    cantidad:      datos.cantidad,
    ingreso:       datos.ingreso,
    mensaje:       `Vendiste "${datos.nombreProducto}"`,
  });
}

/** Notificar admin: producto pendiente de revisión */
function notificarProductoPendiente(producto) {
  emitirAAdmins("product:pending_review", {
    productoId:     producto._id,
    nombreProducto: producto.nombre,
    vendedorId:     producto.vendedor?.id,
    vendedorNombre: producto.vendedor?.nombre,
    mensaje:        "Nuevo producto esperando revisión",
  });
}

/** Notificar admin: usuario reportado */
function notificarUsuarioReportado(datos) {
  emitirAAdmins("user:flagged", {
    usuarioReportadoId: datos.usuarioId,
    motivo:             datos.motivo,
    reportadoPor:       datos.reportadoPor,
    mensaje:            "Usuario reportado para revisión",
  });
}

/** Notificar admin: problema con orden */
function notificarProblemaOrden(orden, descripcion) {
  emitirAAdmins("order:issue", {
    ordenId:     orden._id,
    descripcion,
    usuarioId:   orden.usuario,
    mensaje:     `Problema reportado en orden ${orden._id}`,
  });
}

// ─────────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────────
function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "SocketManager", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  init,
  getIO,
  registrarConexion,
  registrarDesconexion,
  estaConectado,
  totalConectados,
  usuariosConectados,
  // Broadcasting
  emitirAUsuario,
  emitirAAdmins,
  emitirGlobal,
  emitirASala,
  // Notificaciones de negocio
  notificarOrdenCreada,
  notificarCambioEstadoOrden,
  notificarPagoConfirmado,
  notificarProductoVendido,
  notificarProductoPendiente,
  notificarUsuarioReportado,
  notificarProblemaOrden,
};
