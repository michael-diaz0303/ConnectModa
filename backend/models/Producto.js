/**
 * ConnectModa - Modelo Producto
 * Incluye índices optimizados para búsqueda avanzada
 */

const mongoose = require("mongoose");

// ─────────────────────────────────────────────
//  SUB-ESQUEMAS
// ─────────────────────────────────────────────
const VendedorRef = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
    nombre: { type: String, required: true },
    ciudad: { type: String, required: true, index: true },
    logo: { type: String },
    verificado: { type: Boolean, default: false },
  },
  { _id: false }
);

const RatingSchema = new mongoose.Schema(
  {
    promedio: { type: Number, default: 0, min: 0, max: 5 },
    totalReseñas: { type: Number, default: 0 },
    totalVentas: { type: Number, default: 0 },
  },
  { _id: false }
);

// ─────────────────────────────────────────────
//  ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────
const ProductoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre del producto es obligatorio"],
      trim: true,
      maxlength: [150, "El nombre no puede superar 150 caracteres"],
    },

    descripcion: {
      type: String,
      required: [true, "La descripción es obligatoria"],
      trim: true,
      maxlength: [2000, "La descripción no puede superar 2000 caracteres"],
    },

    precio: {
      type: Number,
      required: [true, "El precio es obligatorio"],
      min: [0, "El precio no puede ser negativo"],
    },

    categoria: {
      type: String,
      required: [true, "La categoría es obligatoria"],
      enum: [
        "Vestidos",
        "Camisas",
        "Pantalones",
        "Faldas",
        "Abrigos",
        "Accesorios",
        "Ropa Deportiva",
        "Ropa Interior",
        "Calzado",
        "Niños",
        "Formal",
        "Casual",
        "Otro",
      ],
    },

    tallas: {
      type: [String],
      enum: ["XS", "S", "M", "L", "XL", "XXL", "Única"],
      default: [],
    },

    colores: {
      type: [String],
      default: [],
    },

    imagenes: {
      type: [String],
      validate: {
        validator: (arr) => arr.length <= 8,
        message: "Máximo 8 imágenes por producto",
      },
    },

    vendedor: {
      type: VendedorRef,
      required: true,
    },

    rating: {
      type: RatingSchema,
      default: () => ({}),
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    activo: {
      type: Boolean,
      default: true,
    },

    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: { createdAt: "creadoEn", updatedAt: "actualizadoEn" },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────
//  ÍNDICES - Optimización para búsqueda
// ─────────────────────────────────────────────

// 1. Índice de texto compuesto (nombre + descripción + tags)
//    Permite búsqueda $text eficiente con pesos por relevancia
ProductoSchema.index(
  {
    nombre: "text",
    descripcion: "text",
    tags: "text",
  },
  {
    weights: {
      nombre: 10,       // Nombre tiene mayor relevancia
      tags: 5,          // Tags tienen relevancia media
      descripcion: 1,   // Descripción tiene menor relevancia
    },
    name: "idx_texto_busqueda",
    default_language: "spanish",
  }
);

// 2. Índice en precio (para filtros de rango y ordenamiento)
ProductoSchema.index({ precio: 1 }, { name: "idx_precio" });

// 3. Índice en categoría (filtro más usado)
ProductoSchema.index({ categoria: 1 }, { name: "idx_categoria" });

// 4. Índice en ciudad del vendedor
ProductoSchema.index({ "vendedor.ciudad": 1 }, { name: "idx_ciudad" });

// 5. Índice en tallas (búsqueda en array)
ProductoSchema.index({ tallas: 1 }, { name: "idx_tallas" });

// 6. Índice en rating para filtros y ordenamiento popular
ProductoSchema.index({ "rating.promedio": -1 }, { name: "idx_rating" });
ProductoSchema.index({ "rating.totalVentas": -1 }, { name: "idx_ventas" });

// 7. Índice en activo + creadoEn (para filtrar solo activos y ordenar por nuevo)
ProductoSchema.index({ activo: 1, creadoEn: -1 }, { name: "idx_activo_fecha" });

// 8. Índice compuesto para búsquedas frecuentes (categoría + precio + activo)
ProductoSchema.index(
  { activo: 1, categoria: 1, precio: 1 },
  { name: "idx_categoria_precio" }
);

// ─────────────────────────────────────────────
//  VIRTUALS
// ─────────────────────────────────────────────
ProductoSchema.virtual("imagenPrincipal").get(function () {
  return this.imagenes?.[0] || null;
});

ProductoSchema.virtual("tieneStock").get(function () {
  return this.stock > 0;
});

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = mongoose.model("Producto", ProductoSchema);
