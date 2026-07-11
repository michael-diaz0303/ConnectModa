const mongoose = require('mongoose');
const crypto   = require('crypto');

// ── SUB-SCHEMA: Ítem de la orden ──────────────────────────────────────────────
const itemOrdenSchema = new mongoose.Schema(
  {
    producto: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Producto',
      required: [true, 'El producto es obligatorio.'],
    },

    // Snapshot del producto al momento de la compra
    nombre:    { type: String, required: true },
    imagen:    { type: String },
    propietario: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'Usuario',
    },

    cantidad: {
      type:     Number,
      required: [true, 'La cantidad es obligatoria.'],
      min:      [1, 'La cantidad mínima es 1.'],
    },
    precioUnitario: {
      type:     Number,
      required: [true, 'El precio unitario es obligatorio.'],
      min:      [0, 'El precio no puede ser negativo.'],
    },
    talla: { type: String, trim: true },
    color: { type: String, trim: true },

    subtotal: {
      type:     Number,
      required: true,
      min:      0,
    },

    // Estado individual del ítem (para órdenes con múltiples vendedores)
    estadoItem: {
      type:    String,
      enum:    ['pendiente', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado'],
      default: 'pendiente',
    },
    trackingItem: { type: String, trim: true },
  },
  { _id: true, timestamps: false }
);

// ── SUB-SCHEMA: Dirección de envío ────────────────────────────────────────────
const direccionEnvioSchema = new mongoose.Schema(
  {
    nombre:       { type: String, required: true, trim: true },
    apellido:     { type: String, required: true, trim: true },
    telefono:     { type: String, required: true, trim: true },
    direccion:    { type: String, required: true, trim: true, maxlength: 200 },
    ciudad:       { type: String, required: true, trim: true },
    departamento: { type: String, required: true, trim: true },
    pais:         { type: String, default: 'Colombia' },
    codigoPostal: { type: String, trim: true },
    indicaciones: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

// ── SUB-SCHEMA: Historial de estados ──────────────────────────────────────────
const historialEstadoSchema = new mongoose.Schema(
  {
    estado:       { type: String, required: true },
    descripcion:  { type: String, trim: true },
    fecha:        { type: Date, default: Date.now },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  },
  { _id: false }
);

// ── SCHEMA PRINCIPAL: Orden ────────────────────────────────────────────────────
const ordenSchema = new mongoose.Schema(
  {
    numeroOrden: {
      type:   String,
      unique: true,
    },

    usuario: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Usuario',
      required: [true, 'El usuario es obligatorio.'],
    },

    items: {
      type:     [itemOrdenSchema],
      required: true,
      validate: [
        { validator: (v) => v.length > 0, message: 'La orden debe tener al menos un producto.' }
      ],
    },

    subtotal: {
      type:     Number,
      required: true,
      min:      [0, 'El subtotal no puede ser negativo.'],
    },
    descuento: {
      type:    Number,
      default: 0,
      min:     0,
    },
    impuestos: {
      type:    Number,
      default: 0,
      min:     0,
    },
    costoEnvio: {
      type:    Number,
      default: 0,
      min:     0,
    },
    total: {
      type:     Number,
      required: [true, 'El total es obligatorio.'],
      min:      [0, 'El total no puede ser negativo.'],
    },
    moneda: {
      type:    String,
      default: 'COP',
      enum:    ['COP', 'USD'],
    },

    cuponAplicado: {
      codigo:    { type: String, trim: true, uppercase: true },
      descuento: { type: Number },
      tipo:      { type: String, enum: ['fijo', 'porcentaje'] },
    },

    estado: {
      type:    String,
      enum: {
        values: ['pendiente', 'pagado', 'preparando', 'enviado', 'entregado', 'cancelado', 'reembolsado'],
        message: 'Estado de orden inválido.',
      },
      default: 'pendiente',
    },
    historialEstados: [historialEstadoSchema],

    direccionEnvio: {
      type:     direccionEnvioSchema,
      required: [true, 'La dirección de envío es obligatoria.'],
    },

    metodoPago: {
      tipo: {
        type:     String,
        required: [true, 'El método de pago es obligatorio.'],
        enum: {
          values: ['tarjeta_credito', 'tarjeta_debito', 'pse', 'efectivo', 'nequi', 'daviplata', 'contraentrega'],
          message: 'Método de pago inválido.',
        },
      },
      referencia:   { type: String, trim: true },
      estado:       { type: String, enum: ['pendiente', 'aprobado', 'rechazado', 'reembolsado'], default: 'pendiente' },
      fechaPago:    { type: Date },
      ultimos4:     { type: String, maxlength: 4 },
    },

    envio: {
      transportadora:   { type: String, trim: true },
      numeroGuia:       { type: String, trim: true },
      urlSeguimiento:   { type: String, trim: true },
      fechaEstimada:    { type: Date },
      fechaEnvio:       { type: Date },
      fechaEntrega:     { type: Date },
    },

    notasCliente:  { type: String, trim: true, maxlength: 500 },
    notasInternas: { type: String, trim: true, maxlength: 1000, select: false },

    cancelacion: {
      fecha:  { type: Date },
      razon:  { type: String, trim: true },
      por:    { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON:  { virtuals: true },
    toObject: { virtuals: true },
  }
);

ordenSchema.index({ usuario: 1, createdAt: -1 });
ordenSchema.index({ numeroOrden: 1 }, { unique: true });
ordenSchema.index({ estado: 1 });
ordenSchema.index({ 'metodoPago.estado': 1 });
ordenSchema.index({ 'items.propietario': 1 });
ordenSchema.index({ createdAt: -1 });

ordenSchema.virtual('totalUnidades').get(function () {
  return this.items.reduce((acc, item) => acc + item.cantidad, 0);
});

ordenSchema.virtual('cancelable').get(function () {
  return ['pendiente', 'pagado'].includes(this.estado);
});

ordenSchema.virtual('pagada').get(function () {
  return this.metodoPago?.estado === 'aprobado';
});

ordenSchema.pre('save', function (next) {
  if (!this.isNew) return next();
  const fecha    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const aleatorio = crypto.randomBytes(2).toString('hex').toUpperCase();
  this.numeroOrden = `CM-${fecha}-${aleatorio}`;
  next();
});

ordenSchema.pre('save', function (next) {
  if (!this.isModified('items') && !this.isNew) return next();
  this.items = this.items.map(item => {
    item.subtotal = parseFloat((item.cantidad * item.precioUnitario).toFixed(2));
    return item;
  });
  this.subtotal = parseFloat(
    this.items.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2)
  );
  this.total = parseFloat(
    Math.max(0, this.subtotal - (this.descuento || 0) + (this.impuestos || 0) + (this.costoEnvio || 0)
  ).toFixed(2));
  next();
});

ordenSchema.pre('save', function (next) {
  if (!this.isModified('estado')) return next();
  const mensajes = {
    pendiente:   'Orden creada, esperando confirmación de pago.',
    pagado:      'Pago confirmado. La orden está siendo procesada.',
    preparando:  'Los productos están siendo preparados para envío.',
    enviado:     'La orden ha sido despachada.',
    entregado:   'La orden fue entregada exitosamente.',
    cancelado:   'La orden fue cancelada.',
    reembolsado: 'Se procesó el reembolso.',
  };
  this.historialEstados.push({
    estado:      this.estado,
    descripcion: mensajes[this.estado] || `Estado actualizado a: ${this.estado}`,
    fecha:       new Date(),
  });
  next();
});

ordenSchema.methods.confirmarPago = async function (referencia) {
  this.estado                = 'pagado';
  this.metodoPago.estado     = 'aprobado';
  this.metodoPago.referencia = referencia;
  this.metodoPago.fechaPago  = new Date();
  return this.save();
};

ordenSchema.methods.marcarEnviado = async function (guia, transportadora, urlSeguimiento, fechaEstimada) {
  this.estado                  = 'enviado';
  this.envio.numeroGuia        = guia;
  this.envio.transportadora    = transportadora;
  this.envio.urlSeguimiento    = urlSeguimiento;
  this.envio.fechaEstimada     = fechaEstimada;
  this.envio.fechaEnvio        = new Date();
  return this.save();
};

ordenSchema.methods.marcarEntregado = async function () {
  this.estado              = 'entregado';
  this.envio.fechaEntrega  = new Date();
  return this.save();
};

ordenSchema.methods.cancelar = async function (razon, usuarioId) {
  if (!this.cancelable) throw new Error('Esta orden no puede cancelarse en su estado actual.');
  this.estado             = 'cancelado';
  this.cancelacion.fecha  = new Date();
  this.cancelacion.razon  = razon;
  this.cancelacion.por    = usuarioId;
  if (this.metodoPago?.estado === 'aprobado') {
    this.metodoPago.estado = 'reembolsado';
    this.estado            = 'reembolsado';
  }
  return this.save();
};

ordenSchema.statics.porUsuario = function (usuarioId, filtros = {}) {
  return this.find({ usuario: usuarioId, ...filtros })
    .sort('-createdAt')
    .populate('items.producto', 'nombre imagenes slug');
};

ordenSchema.statics.porVendedor = function (vendedorId) {
  return this.find({ 'items.propietario': vendedorId })
    .sort('-createdAt')
    .select('-notasInternas');
};

ordenSchema.statics.resumenVentas = function (desde, hasta) {
  return this.aggregate([
    {
      $match: {
        estado:           { $in: ['pagado', 'preparando', 'enviado', 'entregado'] },
        'metodoPago.estado': 'aprobado',
        createdAt:        { $gte: desde, $lte: hasta },
      },
    },
    {
      $group: {
        _id:          null,
        totalVentas:  { $sum: '$total' },
        totalOrdenes: { $sum: 1 },
        promedio:     { $avg: '$total' },
      },
    },
  ]);
};

const Orden = mongoose.model('Orden', ordenSchema);
module.exports = Orden;