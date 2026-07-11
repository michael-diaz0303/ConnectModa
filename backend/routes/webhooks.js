/**
 * ConnectModa – Webhook de Wompi
 * Endpoint público — NO requiere autenticación JWT
 *
 * Wompi envía eventos POST a: /api/webhooks/wompi
 * Documentación: https://docs.wompi.co/docs/en/webhooks
 *
 * Configurar en el dashboard de Wompi:
 *   URL: https://tudominio.com/api/webhooks/wompi
 *   Eventos: transaction.updated
 */

const express   = require("express");
const router    = express.Router();
const mongoose  = require("mongoose");

const { verificarFirmaEvento, mapearEstado, centavosACOP } = require("../utils/wompi");
const { enviarConfirmacionPago, enviarNotificacionPagoFallido } = require("../utils/email");

const Orden       = require("../models/Orden");
const Transaccion = require("../models/Transaccion");

// ─── Logger ───────────────────────────────────────────────────────────────────

function log(nivel, evento, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "WebhookWompi", evento, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

// ─── Handlers por tipo de evento ──────────────────────────────────────────────

async function handleTransactionUpdated(transaction) {
  const { id: wompiId, reference, status, amount_in_cents, payment_method_type, status_message } = transaction;

  log("info", "transaction.updated", { wompiId, reference, status });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tx = await Transaccion.findOne({ referencia: reference }).session(session);
    if (!tx) {
      await session.abortTransaction();
      log("warn", "transaction.updated", { msg: "Transacción no encontrada", reference });
      return;
    }

    // Idempotencia: si ya está procesado, ignorar
    if (["exitoso", "reembolsado"].includes(tx.estado)) {
      await session.abortTransaction();
      log("info", "transaction.updated", { msg: "Transacción ya procesada (idempotente)", reference });
      return;
    }

    const estadoInterno = mapearEstado(status);

    // Actualizar transacción
    await Transaccion.findByIdAndUpdate(
      tx._id,
      {
        estado:             estadoInterno,
        wompiTransactionId: wompiId,
        metodoPago:         payment_method_type,
        errorMensaje:       status !== "APPROVED" ? (status_message || status) : undefined,
        $push: {
          eventos: {
            tipo:  `wompi.${status.toLowerCase()}`,
            datos: { status, wompiId, amount_in_cents },
          },
        },
      },
      { session }
    );

    const orden = await Orden.findById(tx.orden).populate("usuario", "nombre email").session(session);
    if (!orden) {
      await session.abortTransaction();
      log("error", "transaction.updated", { msg: "Orden no encontrada", ordenId: tx.orden });
      return;
    }

    if (status === "APPROVED") {
      if (orden.estado !== "pagado") {
        const estadoAnterior = orden.estado;
        orden.estado = "pagado";
        orden.registrarCambioEstado(estadoAnterior, "pagado", null, `Webhook Wompi: ${wompiId}`);
        await orden.save({ session });
      }
      await session.commitTransaction();

      await enviarConfirmacionPago(orden.usuario.email, {
        nombre:      orden.usuario.nombre,
        numeroOrden: orden._id.toString(),
        total:       centavosACOP(amount_in_cents),
        items:       orden.items,
        tracking:    orden.numero_seguimiento || null,
      });

      log("info", "pago_aprobado_webhook", { reference, wompiId, monto: centavosACOP(amount_in_cents) });

    } else if (status === "VOIDED") {
      // Reembolso / anulación
      if (!["cancelado"].includes(orden.estado)) {
        const estadoAnterior = orden.estado;
        orden.estado = "cancelado";
        orden.registrarCambioEstado(estadoAnterior, "cancelado", null, `Anulado Wompi: ${wompiId}`);
        await orden.save({ session });
      }
      await session.commitTransaction();
      log("info", "pago_anulado_webhook", { reference, wompiId });

    } else {
      // DECLINED, ERROR
      await session.commitTransaction();

      await enviarNotificacionPagoFallido(orden.usuario.email, {
        nombre:      orden.usuario.nombre,
        numeroOrden: orden._id.toString(),
        motivo:      status_message || "Pago rechazado",
      });

      log("warn", "pago_fallido_webhook", { reference, status, motivo: status_message });
    }
  } catch (err) {
    await session.abortTransaction();
    log("error", "handleTransactionUpdated", { error: err.message, reference });
    throw err;
  } finally {
    session.endSession();
  }
}

// ─── Endpoint principal — POST /api/webhooks/wompi ────────────────────────────

router.post("/wompi", express.json(), async (req, res) => {
  // Responder 200 rápido — Wompi reintenta si no recibe respuesta en 5s
  const payload  = req.body;
  const checksum = req.headers["x-event-checksum"];

  if (!payload || !payload.event || !payload.data) {
    log("warn", "payload_invalido", { headers: req.headers });
    return res.status(400).json({ error: "Payload inválido" });
  }

  // Verificar firma (salvo en ambiente de pruebas sin secreto configurado)
  if (process.env.WOMPI_EVENTS_SECRET) {
    try {
      const firmaValida = verificarFirmaEvento(payload, checksum);
      if (!firmaValida) {
        log("error", "firma_invalida", { checksum });
        return res.status(401).json({ error: "Firma inválida" });
      }
    } catch (err) {
      log("error", "verificar_firma", { error: err.message });
      return res.status(401).json({ error: err.message });
    }
  }

  log("info", "evento_recibido", { tipo: payload.event, id: payload.data?.transaction?.id });

  // Responder 200 antes de procesar (Wompi no espera)
  res.status(200).json({ recibido: true });

  // Procesar el evento de forma asíncrona
  try {
    switch (payload.event) {
      case "transaction.updated":
        await handleTransactionUpdated(payload.data.transaction);
        break;
      default:
        log("info", "evento_ignorado", { tipo: payload.event });
    }
  } catch (err) {
    // Error en el handler — ya respondimos 200, solo loguear
    log("error", "handler_fallido", { tipo: payload.event, error: err.message });
  }
});

module.exports = router;
