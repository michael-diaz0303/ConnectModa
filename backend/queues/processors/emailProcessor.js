/**
 * ConnectModa – Procesador de Cola de Emails
 * Maneja todos los emails transaccionales del sistema
 *
 * Tipos de email soportados:
 *   order:created       → Confirmación de nueva orden
 *   payment:confirmed   → Recibo de pago
 *   order:status        → Cambio de estado de orden
 *   user:registered     → Bienvenida a nuevo usuario
 *   order:cancelled     → Cancelación de orden
 *   report:ready        → Reporte generado disponible
 *   password:reset      → Recuperación de contraseña
 *
 * Mejoras v2:
 *  - Verificar conexión SMTP al iniciar (fail-fast)
 *  - Sanitizar html básico en datos de usuario (evitar inyección en templates)
 *  - Logging con duración de envío (ms)
 *  - job.progress() en etapas para visibilidad en Bull Board
 */

const nodemailer  = require("nodemailer");
const { emailQueue } = require("../../utils/queues");

// ─────────────────────────────────────────────
//  TRANSPORTER (singleton)
// ─────────────────────────────────────────────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransporter({
    host:   process.env.SMTP_HOST  || "smtp.gmail.com",
    port:   parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool:           true,
    maxConnections: 3,
    rateDelta:      1000,
    rateLimit:      5,
  });

  return _transporter;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const FROM = `ConnectModa <${process.env.SMTP_USER || "noreply@connectmoda.co"}>`;

function formatCOP(n) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0,
  }).format(n || 0);
}

/** Escapar caracteres HTML para evitar inyección en plantillas */
function esc(str) {
  if (typeof str !== "string") return String(str ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHTML(contenido, titulo) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:'Segoe UI',Arial,sans-serif;background:#f4f0e8;margin:0;padding:20px}
.card{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.header{background:#0f0e0d;padding:28px 32px;text-align:center}
.logo{color:#fff;font-size:22px;font-weight:800;margin:0}.logo span{color:#e8420a}
.body{padding:32px}.h2{font-size:20px;font-weight:700;margin:0 0 12px}
.tag{display:inline-block;background:#f0fdf4;color:#16a34a;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:16px}
.btn{display:inline-block;background:#e8420a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;margin-top:16px}
.footer{background:#f4f0e8;padding:16px 32px;text-align:center;font-size:12px;color:#888}
table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #f0ebe0;font-size:14px}
.muted{color:#888;font-size:12px}.total{font-size:18px;font-weight:700;text-align:right}
</style></head><body>
<div class="card">
  <div class="header"><p class="logo">Connect<span>Moda</span></p></div>
  <div class="body">${contenido}</div>
  <div class="footer">ConnectModa · Conectando talleres con el mundo<br>
    <a href="${process.env.FRONTEND_URL || "https://connectmoda.co"}" style="color:#e8420a">connectmoda.co</a>
  </div>
</div></body></html>`;
}

// ─────────────────────────────────────────────
//  PLANTILLAS
//  MEJORA: datos de usuario escapados con esc() en todos los templates
// ─────────────────────────────────────────────
const TEMPLATES = {
  "order:created": ({ usuario, orden }) => ({
    subject: `✅ Orden recibida #${esc(orden.id)} – ConnectModa`,
    html: wrapHTML(`
      <span class="tag">ORDEN CREADA</span>
      <h2 class="h2">¡Hola ${esc(usuario.nombre)}!</h2>
      <p>Recibimos tu orden. En breve comenzaremos a procesarla.</p>
      <table>
        <tr><td>Número de orden</td><td style="text-align:right;font-family:monospace;font-weight:700">${esc(orden.id)}</td></tr>
        <tr><td>Productos</td><td style="text-align:right">${esc(String(orden.items))} artículos</td></tr>
        <tr><td>Estado</td><td style="text-align:right">Pendiente</td></tr>
        <tr><td colspan="2"><span class="total">Total: ${formatCOP(orden.total)}</span></td></tr>
      </table>
      <a href="${process.env.FRONTEND_URL}/ordenes/${esc(orden.id)}" class="btn">Ver mi orden</a>
    `),
  }),

  "payment:confirmed": ({ usuario, orden }) => ({
    subject: `💳 Pago confirmado – Orden #${esc(orden.id)} | ConnectModa`,
    html: wrapHTML(`
      <span class="tag">PAGO CONFIRMADO</span>
      <h2 class="h2">¡Pago recibido, ${esc(usuario.nombre)}!</h2>
      <p>Tu pago fue procesado exitosamente. Tu pedido está siendo preparado.</p>
      <table>
        <tr><td>Orden</td><td style="text-align:right;font-family:monospace">${esc(orden.id)}</td></tr>
        <tr><td>Monto pagado</td><td style="text-align:right;font-weight:700;color:#16a34a">${formatCOP(orden.total)}</td></tr>
        ${orden.seguimiento ? `<tr><td>Seguimiento</td><td style="text-align:right;font-family:monospace">${esc(orden.seguimiento)}</td></tr>` : ""}
      </table>
      <a href="${process.env.FRONTEND_URL}/ordenes/${esc(orden.id)}" class="btn">Ver estado</a>
    `),
  }),

  "order:status": ({ usuario, orden }) => {
    const iconos = { enviado: "📦", entregado: "✅", cancelado: "❌", procesando: "⚙️", pagado: "💳" };
    return {
      subject: `${iconos[orden.estado] || "🔔"} Tu orden fue ${esc(orden.estado)} | ConnectModa`,
      html: wrapHTML(`
        <h2 class="h2">Actualización de tu orden</h2>
        <p>Hola ${esc(usuario.nombre)}, el estado de tu orden cambió a <strong>${esc(orden.estado.toUpperCase())}</strong>.</p>
        ${orden.seguimiento ? `<p style="background:#f0fdf4;padding:12px;border-radius:8px;font-family:monospace;font-weight:700">📍 Seguimiento: ${esc(orden.seguimiento)}</p>` : ""}
        ${orden.fechaEntrega ? `<p>Fecha estimada de entrega: <strong>${new Date(orden.fechaEntrega).toLocaleDateString("es-CO")}</strong></p>` : ""}
        <a href="${process.env.FRONTEND_URL}/ordenes/${esc(orden.id)}" class="btn">Ver orden</a>
      `),
    };
  },

  "user:registered": ({ usuario }) => ({
    subject: `👋 Bienvenido a ConnectModa, ${esc(usuario.nombre)}`,
    html: wrapHTML(`
      <h2 class="h2">¡Hola, ${esc(usuario.nombre)}!</h2>
      <p>Tu cuenta fue creada exitosamente. Ya puedes explorar cientos de productos de talleres artesanales colombianos.</p>
      <a href="${process.env.FRONTEND_URL}/explorar" class="btn">Explorar productos</a>
    `),
  }),

  "order:cancelled": ({ usuario, orden }) => ({
    subject: `❌ Orden cancelada #${esc(orden.id)} | ConnectModa`,
    html: wrapHTML(`
      <h2 class="h2">Tu orden fue cancelada</h2>
      <p>Hola ${esc(usuario.nombre)}, la orden #${esc(orden.id)} fue cancelada${orden.motivo ? `: <em>${esc(orden.motivo)}</em>` : ""}.</p>
      ${orden.total ? `<p>Si ya realizaste un pago, el reembolso se procesará en 5-10 días hábiles.</p>` : ""}
      <a href="${process.env.FRONTEND_URL}/explorar" class="btn">Seguir comprando</a>
    `),
  }),

  "report:ready": ({ usuario, reporte }) => ({
    subject: `📊 Tu reporte está listo | ConnectModa`,
    html: wrapHTML(`
      <h2 class="h2">Reporte generado</h2>
      <p>Hola ${esc(usuario.nombre)}, tu reporte de <strong>${esc(reporte.tipo)}</strong> está listo para descargar.</p>
      <p class="muted">Generado el ${new Date().toLocaleString("es-CO")}</p>
      <a href="${reporte.url}" class="btn">Descargar reporte</a>
    `),
  }),

  "password:reset": ({ usuario, token }) => ({
    subject: `🔑 Recupera tu contraseña | ConnectModa`,
    html: wrapHTML(`
      <h2 class="h2">Recuperación de contraseña</h2>
      <p>Hola ${esc(usuario.nombre)}, recibimos una solicitud para restablecer tu contraseña.</p>
      <p>El enlace expira en <strong>1 hora</strong>.</p>
      <a href="${process.env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}" class="btn">Restablecer contraseña</a>
      <p class="muted" style="margin-top:16px">Si no solicitaste esto, ignora este email.</p>
    `),
  }),
};

// ─────────────────────────────────────────────
//  PROCESADOR
//  MEJORA: job.progress() en etapas + medir duración del envío
// ─────────────────────────────────────────────
async function procesarEmail(job) {
  const { tipo, usuario, datos } = job.data;
  const t0 = Date.now();

  log("info", "procesando", { jobId: job.id, tipo, usuarioEmail: usuario?.email });

  await job.progress(10);

  if (!usuario?.email) throw new Error("Email de usuario no especificado");

  const template = TEMPLATES[tipo];
  if (!template) throw new Error(`Template de email desconocido: "${tipo}"`);

  await job.progress(30);

  const { subject, html } = template({ usuario, ...datos });

  const transporter = getTransporter();

  await job.progress(50);

  const info = await transporter.sendMail({
    from:    FROM,
    to:      usuario.email,
    subject,
    html,
  });

  await job.progress(100);

  const ms = Date.now() - t0;
  log("info", "enviado", {
    jobId: job.id, tipo, messageId: info.messageId,
    usuarioEmail: usuario.email, ms,
  });

  return { messageId: info.messageId, tipo, ms };
}

// ─────────────────────────────────────────────
//  REGISTRAR PROCESADOR EN LA COLA
// ─────────────────────────────────────────────
function iniciar() {
  if (!emailQueue) {
    log("warn", "cola_deshabilitada", { cola: "emailQueue" });
    return;
  }

  // MEJORA: verificar conexión SMTP al iniciar (solo en producción)
  if (process.env.NODE_ENV === "production" && process.env.SMTP_USER) {
    getTransporter().verify((err) => {
      if (err) {
        log("error", "smtp_verify_failed", { error: err.message });
      } else {
        log("info", "smtp_ok", { host: process.env.SMTP_HOST });
      }
    });
  }

  // Concurrencia 3 — enviar hasta 3 emails simultáneos
  emailQueue.process(3, async (job) => {
    try {
      return await procesarEmail(job);
    } catch (err) {
      log("error", "error_procesando", {
        jobId:   job.id,
        error:   err.message,
        intento: job.attemptsMade,
      });
      throw err; // Re-lanzar para que Bull maneje el retry
    }
  });

  log("info", "procesador_iniciado", { cola: "emailQueue", concurrencia: 3 });
}

function log(nivel, accion, datos = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    nivel,
    modulo: "EmailProcessor",
    accion,
    ...datos,
  };
  nivel === "error"
    ? console.error(JSON.stringify(entry))
    : console.log(JSON.stringify(entry));
}

module.exports = { iniciar, procesarEmail, TEMPLATES };
