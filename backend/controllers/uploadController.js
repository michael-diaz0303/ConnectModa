/**
 * ConnectModa – Controller de Upload
 * Subida de imágenes de productos y avatares de usuarios a S3
 */

const mongoose  = require("mongoose");
const Producto  = require("../models/Producto");
const s3Service = require("../utils/s3Service");
const { invalidarProducto } = require("../middleware/cache");
const { imageQueue, encolar } = require("../utils/queues");
const sm = require("../utils/socketManager");

// ─────────────────────────────────────────────
//  HELPER: modelo Usuario (adaptar a tu esquema)
// ─────────────────────────────────────────────
function getUsuarioModel() {
  try {
    return require("../models/Usuario");
  } catch {
    // Si no existe el modelo, crear uno mínimo para no crashear
    const { Schema, model, models } = require("mongoose");
    if (models.Usuario) return models.Usuario;
    return model("Usuario", new Schema({ nombre: String, email: String, avatar: String }));
  }
}

function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "UploadController", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  1. UPLOAD IMAGEN DE PRODUCTO
//  POST /api/upload/producto
//  Body: multipart/form-data, campo "imagenes" (hasta 8 archivos)
//  También acepta campo "productoId" para asociar imágenes
// ─────────────────────────────────────────────
const uploadProductoImage = async (req, res) => {
  try {
    const usuarioId  = req.usuario._id;
    const { productoId, reemplazar_index } = req.body;

    // Aceptar tanto req.file (single) como req.files (array)
    const archivos = req.files || (req.file ? [req.file] : []);

    if (archivos.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "No se recibió ninguna imagen" });
    }

    // ── Validar producto si se especificó ─────────────────────
    let producto = null;
    if (productoId) {
      if (!mongoose.Types.ObjectId.isValid(productoId)) {
        return res.status(400).json({ ok: false, mensaje: "productoId inválido" });
      }

      producto = await Producto.findById(productoId);
      if (!producto) {
        return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
      }

      // Verificar propiedad — solo el vendedor o un admin puede subir imágenes
      const esAdmin = ["admin", "emprendedor"].includes(req.usuario.rol);
      if (!esAdmin && producto.vendedor?.id?.toString() !== usuarioId.toString()) {
        return res.status(403).json({ ok: false, mensaje: "No tienes permisos para editar este producto" });
      }

      // Límite: máximo 8 imágenes por producto
      const imagenesActuales = producto.imagenes?.length || 0;
      if (imagenesActuales + archivos.length > 8) {
        return res.status(400).json({
          ok:      false,
          mensaje: `El producto ya tiene ${imagenesActuales} imágenes. Máximo 8.`,
        });
      }
    }

    // ── Procesar y subir cada imagen ──────────────────────────
    const resultados = [];

    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      s3Service.validarBuffer(archivo.buffer);

      const index  = reemplazar_index !== undefined
        ? parseInt(reemplazar_index)
        : (producto?.imagenes?.length || 0) + i;

      const destino = productoId || `temp_${usuarioId}`;

      // Subir inmediatamente (tamaños thumb/medium/full en paralelo)
      const urls = await s3Service.uploadImage(archivo.buffer, destino, index);
      resultados.push({ index, ...urls });

      log("info", "imagen_subida", {
        usuarioId: usuarioId.toString(),
        productoId,
        index,
        bytes: archivo.buffer.length,
      });
    }

    // ── Actualizar producto en BD si se especificó ────────────
    if (producto) {
      // Insertar o reemplazar URLs en el array de imágenes
      for (const r of resultados) {
        if (reemplazar_index !== undefined) {
          producto.imagenes[r.index] = r.medium; // URL principal en el array
        } else {
          producto.imagenes.push(r.medium);
        }
      }
      await producto.save();

      // Invalidar caché del producto
      await invalidarProducto(productoId);

      // Notificar vía WebSocket al admin si el producto estaba en revisión
      sm.notificarProductoPendiente(producto);
    }

    return res.status(201).json({
      ok:      true,
      mensaje: `${resultados.length} imagen(es) subida(s) exitosamente`,
      imagenes: resultados,
    });

  } catch (err) {
    log("error", "uploadProductoImage", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al subir imagen", detalle: err.message });
  }
};

// ─────────────────────────────────────────────
//  2. UPLOAD AVATAR DE USUARIO
//  POST /api/upload/avatar
//  Body: multipart/form-data, campo "avatar"
// ─────────────────────────────────────────────
const uploadAvatarUsuario = async (req, res) => {
  try {
    const usuarioId = req.usuario._id;
    const archivo   = req.file;

    if (!archivo) {
      return res.status(400).json({ ok: false, mensaje: "No se recibió imagen de avatar" });
    }

    s3Service.validarBuffer(archivo.buffer);

    const Usuario = getUsuarioModel();

    // ── Eliminar avatar anterior si existe ────────────────────
    const usuarioActual = await Usuario.findById(usuarioId).select("avatar").lean();
    if (usuarioActual?.avatar) {
      await s3Service.deleteAvatar(usuarioId.toString()).catch(() => {});
    }

    // ── Subir nuevo avatar (300×300, WebP) ────────────────────
    const url = await s3Service.uploadAvatar(archivo.buffer, usuarioId.toString());

    // ── Actualizar BD ─────────────────────────────────────────
    await Usuario.findByIdAndUpdate(usuarioId, { avatar: url });

    log("info", "avatar_actualizado", { usuarioId: usuarioId.toString(), url: url?.substring(0, 60) });

    return res.status(200).json({ ok: true, mensaje: "Avatar actualizado", avatar: url });

  } catch (err) {
    log("error", "uploadAvatarUsuario", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al subir avatar", detalle: err.message });
  }
};

// ─────────────────────────────────────────────
//  3. ELIMINAR IMAGEN
//  DELETE /api/upload/producto/:productoId/imagen/:index
// ─────────────────────────────────────────────
const eliminarImagen = async (req, res) => {
  try {
    const usuarioId  = req.usuario._id;
    const { productoId, index } = req.params;
    const indexNum   = parseInt(index);

    if (!mongoose.Types.ObjectId.isValid(productoId)) {
      return res.status(400).json({ ok: false, mensaje: "productoId inválido" });
    }
    if (isNaN(indexNum) || indexNum < 0 || indexNum > 7) {
      return res.status(400).json({ ok: false, mensaje: "Índice de imagen inválido (0-7)" });
    }

    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).json({ ok: false, mensaje: "Producto no encontrado" });
    }

    const esAdmin = ["admin", "emprendedor"].includes(req.usuario.rol);
    if (!esAdmin && producto.vendedor?.id?.toString() !== usuarioId.toString()) {
      return res.status(403).json({ ok: false, mensaje: "Sin permisos para eliminar esta imagen" });
    }

    // ── Eliminar de S3 (los 3 tamaños) ───────────────────────
    await s3Service.deleteImage(productoId, indexNum);

    // ── Actualizar array en BD ────────────────────────────────
    producto.imagenes.splice(indexNum, 1);
    await producto.save();

    // Invalidar caché
    await invalidarProducto(productoId);

    log("info", "imagen_eliminada", { usuarioId: usuarioId.toString(), productoId, index: indexNum });

    return res.status(200).json({
      ok:      true,
      mensaje: "Imagen eliminada correctamente",
      imagenesRestantes: producto.imagenes.length,
    });

  } catch (err) {
    log("error", "eliminarImagen", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al eliminar imagen" });
  }
};

// ─────────────────────────────────────────────
//  4. PRESIGNED URL — acceso temporal a archivo privado
//  GET /api/upload/presigned?key=conectmoda/...
// ─────────────────────────────────────────────
const obtenerPresignedURL = async (req, res) => {
  try {
    const { key, ttl = "3600" } = req.query;

    if (!key || typeof key !== "string") {
      return res.status(400).json({ ok: false, mensaje: "Se requiere el parámetro 'key'" });
    }

    // Solo permitir acceso a archivos del propio usuario o si es admin
    const usuarioId = req.usuario._id.toString();
    const esAdmin   = ["admin", "emprendedor"].includes(req.usuario.rol);
    const esPropioArchivo = key.includes(`/${usuarioId}/`);

    if (!esAdmin && !esPropioArchivo) {
      return res.status(403).json({ ok: false, mensaje: "Sin permisos para acceder a este archivo" });
    }

    const url = await s3Service.generatePresignedURL(
      key.trim(),
      Math.min(parseInt(ttl) || 3600, 86400) // Máximo 24 horas
    );

    return res.status(200).json({ ok: true, url, expiraEn: parseInt(ttl) || 3600 });

  } catch (err) {
    log("error", "obtenerPresignedURL", { error: err.message });
    return res.status(500).json({ ok: false, mensaje: "Error al generar URL firmada" });
  }
};

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  uploadProductoImage,
  uploadAvatarUsuario,
  eliminarImagen,
  obtenerPresignedURL,
};
