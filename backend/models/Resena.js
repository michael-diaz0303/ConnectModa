const mongoose = require('mongoose');

const resenaSchema = new mongoose.Schema(
  {
    negocio: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Negocio',
      required: [true, 'El ID del negocio es obligatorio.'],
    },
    autor: {
      nombre: { type: String, required: true, trim: true, maxlength: 80 },
      correo: { type: String, trim: true, lowercase: true },
    },
    calificacion: {
      type:     Number,
      required: [true, 'La calificación es obligatoria.'],
      min:      [1, 'La calificación mínima es 1.'],
      max:      [5, 'La calificación máxima es 5.'],
    },
    comentario: {
      type:      String,
      trim:      true,
      maxlength: [500, 'El comentario no puede superar 500 caracteres.'],
    },
    aprobada: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

resenaSchema.index({ negocio: 1, aprobada: 1 });

const Resena = mongoose.model('Resena', resenaSchema);
module.exports = Resena;