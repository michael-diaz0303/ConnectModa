/**
 * ConnectModa – Utilidad de Email
 * Notificaciones de pago usando Nodemailer + plantillas básicas
 * Instala: npm install nodemailer
 */

const nodemailer = require("nodemailer");
const { formatearCOP } = require("./wompi");

// ─────────────────────────────────────────────
//  TRANSPORTER
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransporter({
  host:   process.env.SMTP_HOST     || "smtp.gmail.com",
  port:   parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `ConnectModa <${process.env.SMTP_USER || "noreply@connectmoda.co"}>`;

// ─────────────────────────────────────────────
//  PLANTILLA: Confirmación de pago
// ─────────────────────────────────────────────
function htmlConfirmacion({ nombre, numeroOrden, total, items, tracking }) {
  const itemsHtml = items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0ebe0">${i.snapshotProducto?.nombre || "Producto"}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0ebe0;text-align:center">${i.cantidad}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0ebe0;text-align:right">${formatearCOP(i.subtotal)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;color:#1a1a1a">
    <div style="background:#0f0e0d;padding:32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px">Connect<span style="color:#e8420a">Moda</span></h1>
    </div>
    <div style="padding:32px;background:#faf7f2">
      <h2 style="margin:0 0 8px">¡Pago confirmado! ✅</h2>
      <p style="color:#666;margin:0 0 24px">Hola ${nombre}, tu pedido está en camino.</p>

      <div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:20px;border:1px solid #e8e0d0">
        <p style="margin:0 0 4px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:.1em">Número de orden</p>
        <p style="margin:0;font-weight:700;font-size:18px;font-family:monospace">${numeroOrden}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="font-size:11px;text-transform:uppercase;color:#999;letter-spacing:.08em">
            <th style="text-align:left;padding-bottom:8px">Producto</th>
            <th style="text-align:center;padding-bottom:8px">Cant.</th>
            <th style="text-align:right;padding-bottom:8px">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="text-align:right;border-top:2px solid #0f0e0d;padding-top:12px">
        <strong style="font-size:18px">Total: ${formatearCOP(total)}</strong>
      </div>

      ${tracking ? `
      <div style="margin-top:20px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
        <p style="margin:0 0 4px;font-size:12px;color:#16a34a;font-weight:600">NÚMERO DE SEGUIMIENTO</p>
        <p style="margin:0;font-family:monospace;font-size:16px;font-weight:700">${tracking}</p>
      </div>` : ""}
    </div>
    <div style="padding:16px 32px;background:#0f0e0d;text-align:center">
      <p style="color:#666;font-size:12px;margin:0">ConnectModa · Conectando talleres con el mundo</p>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
//  PLANTILLA: Pago fallido
// ─────────────────────────────────────────────
function htmlPagoFallido({ nombre, numeroOrden, motivo }) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;color:#1a1a1a">
    <div style="background:#0f0e0d;padding:32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px">Connect<span style="color:#e8420a">Moda</span></h1>
    </div>
    <div style="padding:32px;background:#faf7f2">
      <h2 style="margin:0 0 8px;color:#dc2626">Pago no procesado ❌</h2>
      <p style="color:#666">Hola ${nombre}, hubo un problema al procesar tu pago para la orden <strong>${numeroOrden}</strong>.</p>
      ${motivo ? `<p style="color:#666">Motivo: <em>${motivo}</em></p>` : ""}
      <p style="color:#666">Tu orden sigue en estado <strong>pendiente</strong>. Puedes intentar de nuevo desde tu perfil.</p>
      <a href="${process.env.FRONTEND_URL}/ordenes/${numeroOrden}" 
         style="display:inline-block;margin-top:16px;padding:12px 24px;background:#e8420a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
        Reintentar pago
      </a>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
//  FUNCIONES EXPORTADAS
// ─────────────────────────────────────────────
async function enviarConfirmacionPago(destinatario, datos) {
  try {
    await transporter.sendMail({
      from:    FROM,
      to:      destinatario,
      subject: `✅ Pago confirmado – Orden ${datos.numeroOrden} | ConnectModa`,
      html:    htmlConfirmacion(datos),
    });
    console.log(`[Email] Confirmación enviada a ${destinatario}`);
  } catch (err) {
    // No fallar el flujo de pago por error de email
    console.error(`[Email] Error al enviar confirmación:`, err.message);
  }
}

async function enviarNotificacionPagoFallido(destinatario, datos) {
  try {
    await transporter.sendMail({
      from:    FROM,
      to:      destinatario,
      subject: `❌ Pago no procesado – Orden ${datos.numeroOrden} | ConnectModa`,
      html:    htmlPagoFallido(datos),
    });
  } catch (err) {
    console.error(`[Email] Error al enviar notificación de fallo:`, err.message);
  }
}

module.exports = {
  enviarConfirmacionPago,
  enviarNotificacionPagoFallido,
};
