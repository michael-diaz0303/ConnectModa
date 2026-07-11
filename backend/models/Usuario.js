const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

const usuarioSchema = new mongoose.Schema(
  {
    nombre:    { type: String, required: [true, 'El nombre es obligatorio.'],    trim: true, minlength: 2, maxlength: 60 },
    apellido:  { type: String, required: [true, 'El apellido es obligatorio.'],  trim: true, minlength: 2, maxlength: 60 },
    email: {
      type:      String,
      required:  [true, 'El correo es obligatorio.'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Formato de correo inválido.'],
      maxlength: 150,
    },
    password:  { type: String, required: [true, 'La contraseña es obligatoria.'], minlength: 8, select: false },

    refreshToken: { type: String, select: false },

    telefono:     { type: String, trim: true },
    ubicacion: {
      direccion:    { type: String, trim: true, maxlength: 200 },
      ciudad:       { type: String, trim: true, default: 'Cali' },
      departamento: { type: String, trim: true, default: 'Valle del Cauca' },
      pais:         { type: String, trim: true, default: 'Colombia' },
      codigoPostal: { type: String, trim: true },
    },
    rol:          { type: String, enum: ['emprendedor', 'comprador', 'admin'], default: 'comprador' },
    estado:       { type: String, enum: ['activo', 'inactivo', 'suspendido'],  default: 'activo' },
    verificado:   { type: Boolean, default: false },
    verificadoEn: { type: Date },
    fotoPerfil:   { type: String, default: null },
    descripcion:  { type: String, trim: true, maxlength: 500 },
    nombreTaller: { type: String, trim: true, maxlength: 100 },

    tokenVerificacion:   { type: String, select: false },
    tokenResetPassword:  { type: String, select: false },
    expiraResetPassword: { type: Date,   select: false },
    intentosFallidos:    { type: Number, default: 0 },
    bloqueadoHasta:      { type: Date,   default: null },
    ultimoAcceso:        { type: Date,   default: null },

    totalVentas:    { type: Number, default: 0 },
    totalProductos: { type: Number, default: 0 },
    calificacion:   { type: Number, default: 0, min: 0, max: 5 },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_, ret) => {
        delete ret.password;
        delete ret.refreshToken;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

usuarioSchema.index({ email: 1 },  { unique: true });
usuarioSchema.index({ estado: 1 });
usuarioSchema.index({ rol: 1 });

usuarioSchema.virtual('nombreCompleto').get(function () {
  return `${this.nombre} ${this.apellido}`;
});

usuarioSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

usuarioSchema.methods.compararPassword = async function (pw) {
  return bcrypt.compare(pw, this.password);
};

usuarioSchema.methods.estaBloqueado = function () {
  return this.bloqueadoHasta && this.bloqueadoHasta > new Date();
};

usuarioSchema.methods.registrarIntentoFallido = async function () {
  this.intentosFallidos += 1;
  if (this.intentosFallidos >= 5) {
    this.bloqueadoHasta = new Date(Date.now() + 30 * 60 * 1000);
  }
  await this.save({ validateBeforeSave: false });
};

usuarioSchema.methods.limpiarIntentos = async function () {
  this.intentosFallidos = 0;
  this.bloqueadoHasta   = null;
  this.ultimoAcceso     = new Date();
  await this.save({ validateBeforeSave: false });
};

usuarioSchema.methods.generarTokenReset = async function () {
  const token                 = crypto.randomBytes(32).toString('hex');
  this.tokenResetPassword     = crypto.createHash('sha256').update(token).digest('hex');
  this.expiraResetPassword    = new Date(Date.now() + 10 * 60 * 1000);
  await this.save({ validateBeforeSave: false });
  return token;
};

usuarioSchema.methods.esEmprendedor = function () { return this.rol === 'emprendedor'; };
usuarioSchema.methods.esAdmin       = function () { return this.rol === 'admin'; };

module.exports = mongoose.model('Usuario', usuarioSchema);