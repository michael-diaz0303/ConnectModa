/**
 * ConnectModa – Eventos de Chat en Vivo
 * Chat entre compradores y vendedores con salas, typing y anti-spam
 * Namespace: /chat
 */

const { checkMsgRateLimit } = require("./notificaciones");
const sm = require("../utils/socketManager");

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────
const MAX_MSG_LENGTH  = 1000;    // Caracteres máximos por mensaje
const TYPING_TIMEOUT  = 3000;    // ms antes de limpiar "escribiendo..."
const MAX_MSGS_MINUTO = 20;      // Mensajes por minuto (anti-spam)

// Mensajes por socket para anti-spam granular
const msgCounters = new Map();

function checkChatRateLimit(socketId) {
  const ahora = Date.now();
  const d = msgCounters.get(socketId) || { count: 0, inicio: ahora };
  if (ahora - d.inicio > 60000) { d.count = 0; d.inicio = ahora; }
  d.count++;
  msgCounters.set(socketId, d);
  return d.count <= MAX_MSGS_MINUTO;
}

// Timeouts de "escribiendo..." por sala
const typingTimers = new Map();

// ─────────────────────────────────────────────
//  SANITIZAR mensaje de chat
// ─────────────────────────────────────────────
function sanitizarMensaje(texto) {
  if (typeof texto !== "string") return "";
  return texto
    .trim()
    .replace(/<[^>]*>/g, "")           // Eliminar HTML
    .replace(/javascript:/gi, "")      // Eliminar links JS
    .substring(0, MAX_MSG_LENGTH);
}

// ─────────────────────────────────────────────
//  HANDLER PRINCIPAL
// ─────────────────────────────────────────────
function registrarEventosChat(socket) {
  const { usuario } = socket;

  // ── chat:connect — unirse a sala de chat ──────────────────
  socket.on("chat:connect", ({ salaId, tipo = "soporte" } = {}) => {
    if (!salaId || typeof salaId !== "string") {
      socket.emit("chat:error", { mensaje: "salaId es requerido" });
      return;
    }

    const salaSegura = `chat:${tipo}:${salaId.trim().substring(0, 50)}`;
    socket.join(salaSegura);
    socket.chatSalaActual = salaSegura;

    // Notificar a todos en la sala que alguien entró
    socket.to(salaSegura).emit("chat:user_joined", {
      usuarioId:  usuario._id,
      nombre:     usuario.nombre,
      sala:       salaSegura,
      ts:         Date.now(),
    });

    // Confirmar al propio cliente
    socket.emit("chat:connected", {
      sala:     salaSegura,
      usuario:  { id: usuario._id, nombre: usuario.nombre },
      ts:       Date.now(),
    });

    log("info", "chat_connect", { socketId: socket.id, usuarioId: usuario._id, sala: salaSegura });
  });

  // ── chat:message — enviar mensaje ─────────────────────────
  socket.on("chat:message", ({ salaId, tipo = "soporte", contenido, adjunto } = {}) => {
    // Rate limiting
    if (!checkChatRateLimit(socket.id)) {
      socket.emit("chat:error", { mensaje: "Estás enviando mensajes demasiado rápido. Espera un momento." });
      return;
    }

    // Validar contenido
    const textoLimpio = sanitizarMensaje(contenido);
    if (!textoLimpio && !adjunto) {
      socket.emit("chat:error", { mensaje: "El mensaje no puede estar vacío" });
      return;
    }

    const salaSegura = `chat:${tipo}:${(salaId || "").trim().substring(0, 50)}`;

    const mensaje = {
      id:        `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      salaId:    salaSegura,
      contenido: textoLimpio,
      adjunto:   adjunto || null,
      remitente: {
        id:     usuario._id,
        nombre: usuario.nombre,
        rol:    usuario.rol,
      },
      ts: Date.now(),
    };

    // Cancelar "escribiendo..." si existía
    const timerKey = `${socket.id}:${salaSegura}`;
    if (typingTimers.has(timerKey)) {
      clearTimeout(typingTimers.get(timerKey));
      typingTimers.delete(timerKey);
    }

    // Emitir a todos en la sala (incluido el remitente con echo)
    sm.emitirASala(salaSegura, "chat:message", mensaje);

    log("info", "chat_message", {
      socketId:  socket.id,
      usuarioId: usuario._id,
      sala:      salaSegura,
      longitud:  textoLimpio.length,
    });
  });

  // ── chat:typing — indicador "escribiendo..." ──────────────
  socket.on("chat:typing", ({ salaId, tipo = "soporte", escribiendo = true } = {}) => {
    const salaSegura = `chat:${tipo}:${(salaId || "").trim().substring(0, 50)}`;
    const timerKey   = `${socket.id}:${salaSegura}`;

    // Emitir a los OTROS en la sala (no al propio remitente)
    socket.to(salaSegura).emit("chat:typing", {
      usuarioId: usuario._id,
      nombre:    usuario.nombre,
      escribiendo,
      sala:      salaSegura,
      ts:        Date.now(),
    });

    // Auto-limpiar "escribiendo..." después de timeout
    if (escribiendo) {
      if (typingTimers.has(timerKey)) clearTimeout(typingTimers.get(timerKey));
      const timer = setTimeout(() => {
        socket.to(salaSegura).emit("chat:typing", {
          usuarioId:   usuario._id,
          nombre:      usuario.nombre,
          escribiendo: false,
          sala:        salaSegura,
          ts:          Date.now(),
        });
        typingTimers.delete(timerKey);
      }, TYPING_TIMEOUT);
      typingTimers.set(timerKey, timer);
    }
  });

  // ── chat:disconnect — salir de sala de chat ───────────────
  socket.on("chat:disconnect", ({ salaId, tipo = "soporte" } = {}) => {
    const salaSegura = `chat:${tipo}:${(salaId || "").trim().substring(0, 50)}`;

    socket.leave(salaSegura);

    socket.to(salaSegura).emit("chat:user_left", {
      usuarioId: usuario._id,
      nombre:    usuario.nombre,
      sala:      salaSegura,
      ts:        Date.now(),
    });

    socket.emit("chat:disconnected", { sala: salaSegura, ts: Date.now() });

    // Limpiar timers de typing para esta sala
    const timerKey = `${socket.id}:${salaSegura}`;
    if (typingTimers.has(timerKey)) {
      clearTimeout(typingTimers.get(timerKey));
      typingTimers.delete(timerKey);
    }

    log("info", "chat_disconnect", { socketId: socket.id, usuarioId: usuario._id, sala: salaSegura });
  });

  // Limpiar al desconectarse del servidor
  socket.on("disconnect", () => {
    msgCounters.delete(socket.id);

    // Limpiar todos los timers de typing de este socket
    for (const [key] of typingTimers.entries()) {
      if (key.startsWith(socket.id)) {
        clearTimeout(typingTimers.get(key));
        typingTimers.delete(key);
      }
    }

    // Notificar a la sala actual si estaba conectado
    if (socket.chatSalaActual) {
      socket.to(socket.chatSalaActual).emit("chat:user_left", {
        usuarioId: usuario._id,
        nombre:    usuario.nombre,
        sala:      socket.chatSalaActual,
        motivo:    "desconexion",
        ts:        Date.now(),
      });
    }
  });
}

function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "EventosChat", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

module.exports = { registrarEventosChat };
