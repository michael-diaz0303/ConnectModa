const mongoose = require('mongoose');

// ── SCHEMA DE NEGOCIO ──────────────────────────────────────────────────────────
const negocioSchema = new mongoose.Schema(
  {
    nombre: {
      type:      String,
      required:  [true, 'El nombre del negocio es obligatorio.'],
      trim:      true,
      maxlength: [100, 'El nombre no puede superar 100 caracteres.'],
      minlength: [2,   'El nombre debe tener al menos 2 caracteres.'],
    },

    descripcion: {
      type:      String,
      trim:      true,
      maxlength: [1000, 'La descripción no puede superar 1000 caracteres.'],
    },

    categoria: {
      type:     String,
      required: [true, 'La categoría es obligatoria.'],
      enum: {
        values:  ['ropa', 'calzado', 'accesorios', 'confeccion', 'telas', 'otro'],
        message: 'Categoría inválida.',
      },
    },

    // ── CONTACTO ──────────────────────────────────────────────────────────────
    contacto: {
      telefono: { type: String, trim: true, maxlength: 20 },
      correo:   {
        type:  String,
        trim:  true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Formato de correo inválido.'],
      },
      whatsapp:  { type: String, trim: true },
      instagram: { type: String, trim: true },
      facebook:  { type: String, trim: true },
      sitioWeb:  { type: String, trim: true },
    },

    // ── UBICACIÓN ─────────────────────────────────────────────────────────────
    ubicacion: {
      direccion:  { type: String, trim: true },
      ciudad:     { type: String, trim: true, default: 'Cali' },
      departamento: { type: String, trim: true, default: 'Valle del Cauca' },
      coordenadas: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },

    // ── HORARIOS ──────────────────────────────────────────────────────────────
    horarios: [{
      dia:    {
        type: String,
        enum: ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'],
      },
      apertura: { type: String },  // ej. "08:00"
      cierre:   { type: String },  // ej. "18:00"
      cerrado:  { type: Boolean, default: false },
    }],

    // ── IMÁGENES ──────────────────────────────────────────────────────────────
    imagenes: [{
      url:       { type: String, required: true },
      altText:   { type: String, default: '' },
      esPrincipal: { type: Boolean, default: false },
    }],

    // ── VALORACIONES ──────────────────────────────────────────────────────────
    valoracionPromedio: { type: Number, default: 0, min: 0, max: 5 },
    totalReseñas:       { type: Number, default: 0 },

    // ── ESTADO ────────────────────────────────────────────────────────────────
    // ── PROPIETARIO ──────────────────────────────────────────────────────────
    propietario: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Usuario',
      required: [true, 'El propietario es obligatorio.'],
      index:    true,
    },

    activo:    { type: Boolean, default: true },
    destacado: { type: Boolean, default: false },
  },
  {
    timestamps: true,     // createdAt y updatedAt automáticos
    versionKey: false,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── ÍNDICES ────────────────────────────────────────────────────────────────────
negocioSchema.index({ nombre: 'text', descripcion: 'text' }); // Búsqueda de texto
negocioSchema.index({ categoria: 1 });
negocioSchema.index({ activo: 1 });
negocioSchema.index({ propietario: 1, activo: 1 });
negocioSchema.index({ 'ubicacion.ciudad': 1 });

// ── VIRTUAL: URL de imagen principal ──────────────────────────────────────────
negocioSchema.virtual('imagenPrincipal').get(function () {
  const principal = this.imagenes.find(img => img.esPrincipal);
  return principal ? principal.url : (this.imagenes[0]?.url || null);
});

// ── MÉTODO: actualizar promedio de valoración ──────────────────────────────────
negocioSchema.methods.actualizarValoracion = async function (nuevaNota) {
  const total = this.totalReseñas + 1;
  this.valoracionPromedio = ((this.valoracionPromedio * this.totalReseñas) + nuevaNota) / total;
  this.totalReseñas       = total;
  await this.save();
};

const Negocio = mongoose.model('Negocio', negocioSchema);
module.exports = Negocio;