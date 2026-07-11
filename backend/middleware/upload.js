/**
 * ConnectModa – Middleware de Upload con Multer
 * Almacenamiento temporal en memoria → procesado por Sharp → subido a S3
 */

const multer = require("multer");
const path   = require("path");

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────
const TAMANIO_MAX_BYTES = 10 * 1024 * 1024;  // 10 MB
const TIPOS_PERMITIDOS  = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXTENSIONES_PERMITIDAS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// ─────────────────────────────────────────────
//  VALIDACIÓN DE TIPO
// ─────────────────────────────────────────────
function validarTipoArchivo(req, file, cb) {
  const mimetype = file.mimetype?.toLowerCase();
  const ext      = path.extname(file.originalname).toLowerCase();

  if (TIPOS_PERMITIDOS.has(mimetype) && EXTENSIONES_PERMITIDAS.has(ext)) {
    return cb(null, true);
  }

  cb(new Error(`Tipo de archivo no permitido: ${mimetype}. Usa JPG, PNG o WebP.`));
}

// ─────────────────────────────────────────────
//  MULTER — almacenamiento en MEMORIA (no en disco)
//  Más seguro: el archivo nunca toca el disco, va directo a Sharp → S3
// ─────────────────────────────────────────────
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize:  TAMANIO_MAX_BYTES,
    files:     8,       // Máximo 8 archivos por request
    fields:    20,      // Máximo 20 campos de formulario
  },
  fileFilter: validarTipoArchivo,
});

// ─────────────────────────────────────────────
//  MIDDLEWARES EXPORTADOS
// ─────────────────────────────────────────────

/** Una sola imagen — campo "imagen" */
const uploadUna = upload.single("imagen");

/** Múltiples imágenes de producto — campo "imagenes", máx 8 */
const uploadMultiple = upload.array("imagenes", 8);

/** Avatar de usuario — campo "avatar" */
const uploadAvatar = upload.single("avatar");

// ─────────────────────────────────────────────
//  WRAPPER con manejo de errores de Multer
//  Multer lanza errores de forma no estándar (no next(err) en todos los casos)
// ─────────────────────────────────────────────
function wrapMulter(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        const mensajes = {
          LIMIT_FILE_SIZE:  `El archivo supera el tamaño máximo de ${TAMANIO_MAX_BYTES / 1024 / 1024}MB`,
          LIMIT_FILE_COUNT: "Se superó el límite de archivos permitidos",
          LIMIT_UNEXPECTED_FILE: "Campo de archivo inesperado",
        };
        return res.status(400).json({
          ok:      false,
          mensaje: mensajes[err.code] || `Error de upload: ${err.message}`,
          code:    err.code,
        });
      }

      // Error de validación (tipo de archivo, etc.)
      return res.status(400).json({ ok: false, mensaje: err.message });
    });
  };
}

// ─────────────────────────────────────────────
//  VALIDAR QUE SE SUBIÓ AL MENOS UN ARCHIVO
// ─────────────────────────────────────────────
function requireFile(req, res, next) {
  if (!req.file && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ ok: false, mensaje: "No se recibió ningún archivo" });
  }
  next();
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  // Middlewares listos para usar en rutas
  subirUna:       wrapMulter(uploadUna),
  subirMultiple:  wrapMulter(uploadMultiple),
  subirAvatar:    wrapMulter(uploadAvatar),
  requireFile,
  // Constantes para validación adicional
  TAMANIO_MAX_BYTES,
  TIPOS_PERMITIDOS,
};
