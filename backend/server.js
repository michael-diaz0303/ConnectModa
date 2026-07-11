/**
 * ConnectModa – server.js
 * Entry point: Express + Socket.io + Redis + IA + Colas Bull
 */

require("dotenv").config();

const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const mongoose   = require("mongoose");
const cors       = require("cors");

const app    = express();
const server = http.createServer(app);

// ── Redis ─────────────────────────────────────────────────────────────────────
const redis = require("./utils/redis");
redis.conectar().catch((err) => console.warn("[Redis] Sin caché:", err.message));

// ── CORS ──────────────────────────────────────────────────────────────────────
const origenes = (process.env.CORS_ORIGIN || "http://localhost:5500,http://localhost:3000")
  .split(",").map((o) => o.trim());

app.use(cors({
  origin:      origenes,
  credentials: true,
  methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors:               { origin: origenes, methods: ["GET", "POST"], credentials: true },
  transports:         ["websocket", "polling"],
  pingTimeout:        20000,
  pingInterval:       10000,
  maxHttpBufferSize:  1e5,
});

const sm = require("./utils/socketManager");
sm.init(io);

const { socketAuth } = require("./middleware/socketAuth");
io.use(socketAuth);

const { registrarEventosNotificaciones } = require("./events/notificaciones");
const { registrarEventosChat }           = require("./events/chat");
const { registrarEventosAdmin }          = require("./events/admin");

io.on("connection", (socket) => {
  registrarEventosNotificaciones(socket);
  registrarEventosChat(socket);
  registrarEventosAdmin(socket);
});

// ── Webhook Wompi — debe ir ANTES de express.json() ──────────────────────────
// Wompi envía JSON, no necesita body raw como Stripe
app.use("/api/webhooks", require("./routes/webhooks"));

// ── Middlewares globales ──────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Sentry (si está configurado) ──────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  const { requestHandler } = require("./config/sentry");
  app.use(requestHandler);
}

// ── Rutas REST (/api) ─────────────────────────────────────────────────────────
app.use("/api", require("./routes/index"));

// ── Health check rápido (sin auth) ───────────────────────────────────────────
app.get("/health", async (req, res) => {
  const { healthCheck } = require("./utils/queueMonitor");
  const [colasHealth]   = await Promise.allSettled([healthCheck()]);

  res.json({
    ok:          true,
    uptime:      process.uptime(),
    conectados:  sm.totalConectados(),
    redis:       redis.getEstado(),
    colas:       colasHealth.value || { error: "no disponible" },
    ia_provider: process.env.IA_PROVIDER || "gemini",
    ts:          Date.now(),
  });
});

// ── Sentry error handler ──────────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  const { errorHandler: sentryErrorHandler } = require("./config/sentry");
  app.use(sentryErrorHandler);
}

// ── 404 y error global ────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ ok: false, mensaje: "Ruta no encontrada" }));
app.use((err, req, res, _next) => {
  console.error("[Express]", err.message);
  res.status(err.status || 500).json({
    ok:      false,
    mensaje: process.env.NODE_ENV === "production" ? "Error interno" : err.message,
  });
});

// ── MongoDB → arranque ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("[MongoDB]  ✓ Conectado");

    const { iniciarColas } = require("./utils/queueInit");
    iniciarColas(app);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`[ConnectModa] ✓ Puerto ${PORT}`);
      console.log(`[Redis]       ${redis.isConectado() ? "✓ activo" : "✗ sin caché"}`);
      console.log(`[IA]          ${process.env.IA_PROVIDER || "gemini"} / ${process.env.IA_MODEL || "auto"}`);
      console.log(`[Queues]      ${process.env.QUEUE_ENABLED !== "false" ? "✓ activas" : "✗ deshabilitadas"}`);
      console.log(`[Bull Board]  http://localhost:${PORT}/admin/queues`);
    });
  })
  .catch((err) => { console.error("[MongoDB]", err.message); process.exit(1); });

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGTERM", async () => {
  console.log("[ConnectModa] Cerrando...");
  const { cerrarColas }    = require("./utils/queues");
  const { detenerMonitor } = require("./utils/queueMonitor");
  detenerMonitor();
  await cerrarColas();
  await redis.cerrar();
  io.close();
  server.close(() => { mongoose.connection.close(); process.exit(0); });
});

module.exports = { app, server, io };
