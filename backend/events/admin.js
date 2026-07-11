/**
 * ConnectModa – Eventos de Administración
 * Solo accesible para roles admin/emprendedor
 * Se registra en el namespace principal pero con guardas de rol
 */

const sm = require("../utils/socketManager");

// ─────────────────────────────────────────────
//  GUARD de rol
// ─────────────────────────────────────────────
function soloAdmin(socket, callback) {
  if (!["admin", "emprendedor"].includes(socket.usuario?.rol)) {
    socket.emit("error:permisos", { mensaje: "Acción restringida a administradores" });
    return;
  }
  callback();
}

// ─────────────────────────────────────────────
//  HANDLER PRINCIPAL
// ─────────────────────────────────────────────
function registrarEventosAdmin(socket) {
  const { usuario } = socket;

  // Solo configurar handlers si es admin
  if (!["admin", "emprendedor"].includes(usuario.rol)) return;

  log("info", "admin_registrado", { socketId: socket.id, usuarioId: usuario._id, rol: usuario.rol });

  // ── admin:dashboard:subscribe — suscribirse a métricas live
  socket.on("admin:dashboard:subscribe", () => {
    soloAdmin(socket, () => {
      socket.join("admin:dashboard");
      socket.emit("admin:dashboard:subscribed", {
        conectados: sm.totalConectados(),
        ts:         Date.now(),
      });
    });
  });

  // ── admin:stats:request — pedir estadísticas actuales
  socket.on("admin:stats:request", () => {
    soloAdmin(socket, () => {
      socket.emit("admin:stats", {
        usuariosConectados: sm.totalConectados(),
        timestamp:          Date.now(),
      });
    });
  });

  // ── admin:broadcast — enviar mensaje a todos los usuarios
  socket.on("admin:broadcast", ({ mensaje, tipo = "info" } = {}) => {
    soloAdmin(socket, () => {
      if (!mensaje || typeof mensaje !== "string") return;

      const mensajeLimpio = mensaje.trim().substring(0, 500);
      sm.emitirGlobal("admin:announcement", {
        mensaje:    mensajeLimpio,
        tipo,        // "info" | "warning" | "maintenance"
        emisor:     usuario.nombre,
        ts:         Date.now(),
      });

      log("info", "admin_broadcast", { usuarioId: usuario._id, tipo, longitud: mensajeLimpio.length });
    });
  });

  // ── admin:resolve:issue — marcar problema de orden como resuelto
  socket.on("admin:resolve:issue", ({ ordenId, nota } = {}) => {
    soloAdmin(socket, () => {
      if (!ordenId) return;

      // Notificar a todos los admins que el issue fue resuelto
      sm.emitirAAdmins("order:issue:resolved", {
        ordenId,
        resolverPor: usuario.nombre,
        nota:        (nota || "").substring(0, 300),
        ts:          Date.now(),
      });

      log("info", "issue_resuelto", { ordenId, adminId: usuario._id });
    });
  });

  // ── admin:user:notify — enviar notificación a usuario específico
  socket.on("admin:user:notify", ({ usuarioId, evento, datos } = {}) => {
    soloAdmin(socket, () => {
      if (!usuarioId || !evento) return;

      const eventosPermitidos = [
        "notification:info",
        "notification:warning",
        "account:suspended",
        "account:verified",
      ];

      if (!eventosPermitidos.includes(evento)) {
        socket.emit("error:evento", { mensaje: `Evento "${evento}" no permitido` });
        return;
      }

      sm.emitirAUsuario(usuarioId, evento, {
        ...datos,
        emisor: usuario.nombre,
      });

      log("info", "admin_notify_user", { adminId: usuario._id, usuarioId, evento });
    });
  });
}

function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "EventosAdmin", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

module.exports = { registrarEventosAdmin };
