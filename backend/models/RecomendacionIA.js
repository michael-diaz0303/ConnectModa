/**
 * ConnectModa – Modelos de IA
 * Perfil de preferencias del usuario + historial de conversaciones
 */

const mongoose = require("mongoose");

// ─────────────────────────────────────────────
//  MODELO: RecomendacionIA
//  Perfil de comportamiento del usuario para personalización
// ─────────────────────────────────────────────
const RecomendacionIASchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref:      "Usuario",
      required: true,
      unique:   true,   // Un perfil por usuario
      index:    true,
    },

    // ── Preferencias inferidas ───────────────────────────────────
    categorias_preferidas: {
      type: [String],
      default: [],
    },

    precio_promedio: {
      type:    Number,
      default: 0,
      min:     0,
    },

    precio_min_habitual: { type: Number, default: 0 },
    precio_max_habitual: { type: Number, default: 0 },

    // ── Historial de comportamiento ──────────────────────────────
    historial_busquedas: {
      type: [
        {
          query:   { type: String },
          fecha:   { type: Date, default: Date.now },
          resultados: { type: Number },
        },
      ],
      default: [],
    },

    productos_vistos: {
      type: [
        {
          producto:  { type: mongoose.Schema.Types.ObjectId, ref: "Producto" },
          veces:     { type: Number, default: 1 },
          ultimaVez: { type: Date,   default: Date.now },
        },
      ],
      default: [],
    },

    productos_comprados: {
      type: [
        {
          producto:   { type: mongoose.Schema.Types.ObjectId, ref: "Producto" },
          categoria:  { type: String },
          precio:     { type: Number },
          fecha:      { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // ── Métricas ──────────────────────────────────────────────────
    rating_promedio_productos: {
      type:    Number,
      default: 0,
      min:     0,
      max:     5,
    },

    // ── Descripción libre del usuario ────────────────────────────
    descripcion_preferencias: {
      type:      String,
      maxlength: 1000,
    },

    // ── Resumen generado por IA ───────────────────────────────────
    resumen_ia: {
      type:      String,
      maxlength: 2000,
    },

    ultima_actualizacion: {
      type:    Date,
      default: Date.now,
    },

    // IDs de los últimos productos recomendados (para no repetir)
    ultima_recomendacion_ids: {
      type:    [String],
      default: [],
    },
  },
  {
    timestamps: { createdAt: "creadoEn", updatedAt: "actualizadoEn" },
  }
);

// ─────────────────────────────────────────────
//  MODELO: ChatHistorial
//  Conversaciones del consultor IA
// ─────────────────────────────────────────────
const MensajeSchema = new mongoose.Schema(
  {
    rol:       { type: String, enum: ["user", "assistant", "system"], required: true },
    contenido: { type: String, required: true, maxlength: 4000 },
    fecha:     { type: Date,   default: Date.now },
    // Metadatos de la respuesta de IA
    tokens_usados: { type: Number },
    productos_mencionados: [{ type: mongoose.Schema.Types.ObjectId, ref: "Producto" }],
  },
  { _id: true }
);

const ChatHistorialSchema = new mongoose.Schema(
  {
    usuario: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Usuario",
      required: true,
      index:    true,
    },
    sesion_id: {
      type:    String,
      required: true,
      index:   true,
    },
    mensajes: {
      type:    [MensajeSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 50,
        message: "Una sesión no puede tener más de 50 mensajes",
      },
    },
    activa:   { type: Boolean, default: true },
    proveedor_ia: { type: String },        // "openai", "claude", "gemini", "ollama"
    tokens_totales: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: "creadoEn", updatedAt: "actualizadoEn" },
  }
);

ChatHistorialSchema.index({ usuario: 1, creadoEn: -1 });

const RecomendacionIA = mongoose.model("RecomendacionIA", RecomendacionIASchema);
const ChatHistorial   = mongoose.model("ChatHistorial",   ChatHistorialSchema);

module.exports = { RecomendacionIA, ChatHistorial };
