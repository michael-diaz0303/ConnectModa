/**
 * ConnectModa – Modelos de Analytics
 * Evento raw + Estadística diaria agregada
 */

const mongoose = require("mongoose");

// ─────────────────────────────────────────────
//  TIPOS DE EVENTO VÁLIDOS
// ─────────────────────────────────────────────
const TIPOS_EVENTO = [
  "page_view",        // Vista de listado de productos
  "product_view",     // Vista de producto individual
  "search",           // Búsqueda realizada
  "purchase",         // Compra completada
  "cart_add",         // Producto añadido al carrito
  "cart_remove",      // Producto eliminado del carrito
  "user_registered",  // Nuevo registro
  "chat_started",     // Inicio de chat con consultor IA
  "image_viewed",     // Vista de imagen en detalle
];

// ─────────────────────────────────────────────
//  MODELO: AnalyticsEvento (datos raw)
//  Append-only — nunca se edita, solo se inserta
// ─────────────────────────────────────────────
const AnalyticsEventoSchema = new mongoose.Schema(
  {
    tipo: {
      type:     String,
      enum:     TIPOS_EVENTO,
      required: true,
    },
    usuario: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "Usuario",
      index: true,
      default: null,   // Nullable — soporta usuarios anónimos
    },
    producto: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Producto",
      default: null,
      sparse:  true,
    },
    // Datos flexibles por tipo de evento
    datos: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // Ejemplos:
      // product_view → { categoria, precio, vendedorId }
      // search       → { query, resultados, filtros }
      // purchase     → { ordenId, total, items: [] }
    },
    // Datos de sesión (sin PII sensible)
    sesion: {
      ip:          { type: String },  // Anonimizada (primeros 3 octetos)
      dispositivo: { type: String },  // "mobile" | "desktop" | "tablet"
      pais:        { type: String },
      fuente:      { type: String },  // utm_source
    },
    timestamp: {
      type:    Date,
      default: Date.now,
      index:   true,
    },
  },
  {
    // No usar timestamps de Mongoose — usamos nuestro propio timestamp
    // para poder indexarlo de forma eficiente con TTL
    versionKey: false,
  }
);

// ── Índices compuestos para las queries más frecuentes ────────
AnalyticsEventoSchema.index({ tipo: 1, timestamp: -1 });
AnalyticsEventoSchema.index({ usuario: 1, timestamp: -1 });
AnalyticsEventoSchema.index({ producto: 1, tipo: 1, timestamp: -1 });
AnalyticsEventoSchema.index({ "datos.categoria": 1, timestamp: -1 });

// TTL: eliminar eventos con más de 90 días (mantener livianda la colección)
// Los datos agregados persisten en EstadisticaDiaria
AnalyticsEventoSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

// ─────────────────────────────────────────────
//  MODELO: EstadisticaDiaria (datos agregados)
//  Una entrada por día — se calcula en background
// ─────────────────────────────────────────────
const TopProductoSchema = new mongoose.Schema(
  {
    producto:  { type: mongoose.Schema.Types.ObjectId, ref: "Producto" },
    nombre:    { type: String },
    vistas:    { type: Number, default: 0 },
    ventas:    { type: Number, default: 0 },
    ingresos:  { type: Number, default: 0 },
  },
  { _id: false }
);

const EstadisticaDiariaSchema = new mongoose.Schema(
  {
    fecha: {
      type:     Date,
      required: true,
      unique:   true,   // Una fila por día
      index:    true,
    },
    // Métricas de tráfico
    total_visitas:         { type: Number, default: 0 },
    total_usuarios_unicos: { type: Number, default: 0 },
    total_busquedas:       { type: Number, default: 0 },
    total_product_views:   { type: Number, default: 0 },
    // Métricas de negocio
    total_ventas:          { type: Number, default: 0 },
    ingresos:              { type: Number, default: 0 },
    ticket_promedio:       { type: Number, default: 0 },
    conversion_rate:       { type: Number, default: 0 }, // %
    // Rankings
    top_productos:         { type: [TopProductoSchema], default: [] },
    top_categorias: [
      {
        categoria: String,
        vistas:    Number,
        ventas:    Number,
        ingresos:  Number,
        _id:       false,
      },
    ],
    top_busquedas: [
      {
        query:       String,
        count:       Number,
        resultados:  Number,
        _id:         false,
      },
    ],
    // Usuarios nuevos vs recurrentes
    usuarios_nuevos:      { type: Number, default: 0 },
    usuarios_recurrentes: { type: Number, default: 0 },
    // Timestamp de última actualización
    actualizadoEn: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

EstadisticaDiariaSchema.index({ fecha: -1 });

// ─────────────────────────────────────────────
//  EVITAR REDEFINICIÓN EN HOT-RELOAD
// ─────────────────────────────────────────────
const AnalyticsEvento = mongoose.models.AnalyticsEvento
  || mongoose.model("AnalyticsEvento", AnalyticsEventoSchema);

const EstadisticaDiaria = mongoose.models.EstadisticaDiaria
  || mongoose.model("EstadisticaDiaria", EstadisticaDiariaSchema);

module.exports = { AnalyticsEvento, EstadisticaDiaria, TIPOS_EVENTO };
