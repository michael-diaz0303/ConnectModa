/**
 * ConnectModa – Modelo Transaccion
 * Registro inmutable de cada intento/pago — auditoría y PCI compliance
 * Integración: Wompi (PSE, Nequi, Tarjeta, Bancolombia Transfer)
 */

const mongoose = require("mongoose");

const TransaccionSchema = new mongoose.Schema(
  {
    orden: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Orden",
      required: true,
      index:    true,
    },
    usuario: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Usuario",
      required: true,
      index:    true,
    },

    // ── Wompi ──────────────────────────────────────────────────
    referencia: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
      // Formato: CM-XXXXXX-TIMESTAMP  (generado en pagoController)
    },
    wompiTransactionId: {
      type:   String,
      sparse: true,
      index:  true,
      // Se llena cuando Wompi confirma (puede llegar por confirmarPago o webhook)
    },

    // ── Montos ─────────────────────────────────────────────────
    montoCOP: {
      type:     Number,
      required: true,
      min:      0,
    },
    montoCentavos: {
      type:     Number,
      required: true,
      // montoCOP × 100 — formato que usa Wompi
    },
    moneda: {
      type:    String,
      default: "COP",
    },

    // ── Estado ─────────────────────────────────────────────────
    estado: {
      type:    String,
      enum:    ["creado", "procesando", "exitoso", "fallido", "reembolsado", "reembolso_parcial"],
      default: "creado",
      index:   true,
    },

    // ── Método de pago Wompi ───────────────────────────────────
    metodoPago: {
      type: String,
      enum: ["CARD", "PSE", "NEQUI", "BANCOLOMBIA_TRANSFER", null],
      // Se llena al confirmar
    },
    // Para tarjetas: datos no sensibles (PCI)
    marcaTarjeta: { type: String },   // VISA, MASTERCARD, etc.
    ultimos4:     { type: String },   // NUNCA guardar número completo

    // ── Errores ────────────────────────────────────────────────
    errorMensaje: { type: String },

    // ── Historial de eventos Wompi ─────────────────────────────
    eventos: [
      {
        tipo:  { type: String },
        fecha: { type: Date, default: Date.now },
        datos: { type: mongoose.Schema.Types.Mixed },
      },
    ],

    // ── Seguridad / fraud detection ────────────────────────────
    ipCliente: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: "creadoEn", updatedAt: "actualizadoEn" },
  }
);

// Índices compuestos para el panel de admin y reportes
TransaccionSchema.index({ estado: 1, creadoEn: -1 });
TransaccionSchema.index({ usuario: 1, creadoEn: -1 });
TransaccionSchema.index({ referencia: 1, estado: 1 });

module.exports = mongoose.model("Transaccion", TransaccionSchema);
