/**
 * ConnectModa – Configuración AWS y proveedores alternativos de storage
 *
 * Proveedor activo: STORAGE_PROVIDER en .env
 *   s3         → AWS S3 (recomendado producción)
 *   cloudinary → Cloudinary (25 GB gratis/mes)
 *   local      → Disco local (desarrollo)
 */

const { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ─────────────────────────────────────────────
//  PROVIDER
// ─────────────────────────────────────────────
const PROVIDER = (process.env.STORAGE_PROVIDER || "s3").toLowerCase();

// ─────────────────────────────────────────────
//  AWS S3
// ─────────────────────────────────────────────
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_BUCKET  = process.env.AWS_S3_BUCKET || "connectmoda-assets";
const CDN_URL    = process.env.AWS_CLOUDFRONT_URL || `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;

let _s3Client = null;

function getS3() {
  if (_s3Client) return _s3Client;
  if (!process.env.AWS_ACCESS_KEY_ID) throw new Error("AWS_ACCESS_KEY_ID no configurado");

  _s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return _s3Client;
}

// ─────────────────────────────────────────────
//  ESTRUCTURA DE KEYS EN S3
// ─────────────────────────────────────────────
const KEYS = {
  productoImagen: (productoId, sufijo) =>
    `conectmoda/productos/${productoId}/${sufijo}.webp`,

  productoImagenN: (productoId, index, sufijo) =>
    `conectmoda/productos/${productoId}/img${index}_${sufijo}.webp`,

  avatarUsuario: (usuarioId) =>
    `conectmoda/usuarios/${usuarioId}/avatar.webp`,

  reporte: (reporteId) =>
    `conectmoda/reportes/${reporteId}.pdf`,

  temp: (nombre) =>
    `conectmoda/temp/${Date.now()}_${nombre}`,
};

// ─────────────────────────────────────────────
//  OPERACIONES CORE S3
// ─────────────────────────────────────────────

async function subirS3(buffer, key, contentType = "image/webp", metadata = {}) {
  const s3 = getS3();
  await s3.send(new PutObjectCommand({
    Bucket:       S3_BUCKET,
    Key:          key,
    Body:         buffer,
    ContentType:  contentType,
    CacheControl: "public, max-age=31536000, immutable",
    Metadata:     metadata,
  }));
  return `${CDN_URL}/${key}`;
}

async function eliminarS3(key) {
  const s3 = getS3();
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

async function urlFirmadaS3(key, expiresIn = 3600) {
  const s3  = getS3();
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

// ─────────────────────────────────────────────
//  CLOUDINARY (alternativa gratuita)
//  npm install cloudinary
// ─────────────────────────────────────────────
function getCloudinary() {
  try {
    const cloudinary = require("cloudinary").v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure:     true,
    });
    return cloudinary;
  } catch {
    throw new Error("Instala cloudinary: npm install cloudinary");
  }
}

async function subirCloudinary(buffer, carpeta, publicId) {
  const cloud = getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloud.uploader.upload_stream(
      { folder: `connectmoda/${carpeta}`, public_id: publicId, resource_type: "image",
        format: "webp", quality: "auto:good", fetch_format: "auto" },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

// ─────────────────────────────────────────────
//  STORAGE LOCAL (desarrollo)
// ─────────────────────────────────────────────
const path = require("path");
const fs   = require("fs");
const LOCAL_DIR = path.join(process.cwd(), "public", "uploads");

function subirLocal(buffer, key) {
  const filePath = path.join(LOCAL_DIR, key.replace(/\//g, "_"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  const base = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${base}/uploads/${path.basename(filePath)}`;
}

function eliminarLocal(key) {
  const filePath = path.join(LOCAL_DIR, key.replace(/\//g, "_"));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

// ─────────────────────────────────────────────
//  INTERFAZ UNIFICADA
// ─────────────────────────────────────────────
async function subir(buffer, key, contentType = "image/webp", metadata = {}) {
  switch (PROVIDER) {
    case "s3":
      return subirS3(buffer, key, contentType, metadata);
    case "cloudinary": {
      const carpeta  = key.split("/").slice(1, -1).join("/");
      const publicId = key.split("/").pop().replace(/\.\w+$/, "");
      const res      = await subirCloudinary(buffer, carpeta, publicId);
      return res.secure_url;
    }
    case "local":
      return subirLocal(buffer, key);
    default:
      throw new Error(`Proveedor desconocido: "${PROVIDER}"`);
  }
}

async function eliminar(key) {
  switch (PROVIDER) {
    case "s3":
      return eliminarS3(key);
    case "cloudinary": {
      const cloud    = getCloudinary();
      const publicId = `connectmoda/${key.replace(/\.\w+$/, "")}`;
      await cloud.uploader.destroy(publicId);
      break;
    }
    case "local":
      eliminarLocal(key);
      break;
  }
}

async function urlFirmada(key, expiresIn = 3600) {
  if (PROVIDER === "s3") return urlFirmadaS3(key, expiresIn);
  // Cloudinary y local no necesitan URLs firmadas para imágenes públicas
  return `${CDN_URL}/${key}`;
}

// ─────────────────────────────────────────────
//  EXTRAER KEY DE UNA URL
// ─────────────────────────────────────────────
function keyDesdeURL(url) {
  if (!url) return null;
  // S3: https://cdn.connectmoda.co/conectmoda/productos/abc/full.webp
  //      → conectmoda/productos/abc/full.webp
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, "");
  } catch {
    return url;
  }
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  PROVIDER,
  S3_BUCKET,
  CDN_URL,
  KEYS,
  subir,
  eliminar,
  urlFirmada,
  keyDesdeURL,
  // Acceso directo a S3 para casos especiales
  getS3,
  subirS3,
  eliminarS3,
  urlFirmadaS3,
};

// ─── Funciones adicionales de s3Service ────────────────────────────────
    log("info", "presigned_generado", { key, ttl });
    return url;
  } catch (err) {
    log("error", "presigned_error", { key, error: err.message });
    throw err;
  }
}

// ─────────────────────────────────────────────
//  VALIDAR BUFFER DE IMAGEN
// ─────────────────────────────────────────────
function validarBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Buffer de imagen inválido");
  }
  if (buffer.length === 0) {
    throw new Error("El archivo está vacío");
  }
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("El archivo supera los 10MB permitidos");
  }
  return true;
}

// ─────────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────────
function log(nivel, accion, datos = {}) {
  const entry = { ts: new Date().toISOString(), nivel, modulo: "S3Service", accion, ...datos };
  nivel === "error" ? console.error(JSON.stringify(entry)) : console.log(JSON.stringify(entry));
}

// ─────────────────────────────────────────────
//  EXPORTAR
// ─────────────────────────────────────────────
module.exports = {
  uploadImage,
  uploadAvatar,
  deleteImage,
  deleteAvatar,
  deleteByURL,
  generatePresignedURL,
  validarBuffer,
  TAMANIOS,
  KEYS,
  CDN_URL,
};
