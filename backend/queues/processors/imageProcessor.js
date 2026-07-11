/**
 * ConnectModa – Procesador de Cola de Imágenes
 * Descarga, redimensiona (5 tamaños), optimiza y sube a S3
 * Luego actualiza la BD con las nuevas URLs
 *
 * Requiere: npm install sharp @aws-sdk/client-s3
 * Si no están instalados, el procesador usa la URL original como fallback
 *
 * Mejoras v2:
 *  - Validar tamaño de imagen antes de procesar (máx 20 MB) para evitar OOM
 *  - Singleton de S3Client para no crear una instancia nueva en cada job
 *  - Pipeline paralelo: procesar todos los tamaños en paralelo con Promise.all
 *    (antes era secuencial con un for-loop)
 *  - Strip EXIF en todos los tamaños (sharp.rotate() aplica orientación automática)
 *  - Fallback graceful cuando S3 falla: guardar URL original en BD en vez de fallar el job
 */

const { imageQueue } = require("../../utils/queues");
const Producto       = require("../../models/Producto");

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────
const MAX_BYTES       = 20 * 1024 * 1024; // 20 MB
const DOWNLOAD_TIMEOUT_MS = 30_000;

const TAMANIOS = [
  { sufijo: "thumb",  ancho: 150,  alto: 150,  calidad: 70               },
  { sufijo: "small",  ancho: 300,  alto: 300,  calidad: 75               },
  { sufijo: "medium", ancho: 600,  alto: 600,  calidad: 80               },
  { sufijo: "large",  ancho: 1200, alto: 1200, calidad: 85               },
  { sufijo: "webp",   ancho: 800,  alto: 800,  calidad: 80, formato: "webp" },
];

// ─────────────────────────────────────────────
//  S3 SINGLETON
//  MEJORA: una sola instancia por proceso en vez de recrear en cada job
// ─────────────────────────────────────────────
let _s3 = null;

function getS3() {
  if (_s3) return _s3;
  try {
    const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
    const client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    _s3 = {
      client,
      PutObjectCommand,
      bucket: process.env.AWS_S3_BUCKET || "connectmoda-images",
    };
    return _s3;
  } catch (_) {
    return null;
  }
}

function getSharp() {
  try { return require("sharp"); } catch (_) { return null; }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/** Descargar imagen desde URL como Buffer con validación de tamaño */
async function descargarImagen(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`No se pudo descargar imagen: HTTP ${resp.status}`);

  // MEJORA: verificar Content-Length antes de consumir el body
  const contentLength = parseInt(resp.headers.get("content-length") || "0");
  if (contentLength > MAX_BYTES) {
    throw new Error(`Imagen demasiado grande: ${contentLength} bytes (máximo ${MAX_BYTES})`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());

  // Verificación real del tamaño en caso de que Content-Length fuera 0
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Imagen demasiado grande: ${buffer.length} bytes (máximo ${MAX_BYTES})`);
  }

  return buffer;
}

/** Subir buffer a S3 y retornar URL pública */
async function subirAS3(buffer, key, contentType = "image/jpeg") {
  const s3 = getS3();
  if (!s3) throw new Error("AWS SDK no instalado. Ejecuta: npm install @aws-sdk/client-s3");

  await s3.client.send(
    new s3.PutObjectCommand({
      Bucket:       s3.bucket,
      Key:          key,
      Body:         buffer,
      ContentType:  contentType,
      CacheControl: "public, max-age=31536000",
      ACL:          "public-read",
    })
  );

  const cdn = process.env.AWS_CLOUDFRONT_URL || `https://${s3.bucket}.s3.amazonaws.com`;
  return `${cdn}/${key}`;
}

function generarKey(productoId, imagenIndex, sufijo, formato = "jpg") {
  return `productos/${productoId}/img${imagenIndex}_${sufijo}.${formato}`;
}

// ─────────────────────────────────────────────
//  PROCESAR UN TAMAÑO (función pura)
// ─────────────────────────────────────────────
async function procesarTamanio(sharp, imagenBuffer, tamanio, productoId, imagenIndex, urlOriginal) {
  const { sufijo, ancho, alto, calidad, formato = "jpeg" } = tamanio;

  try {
    // MEJORA: .rotate() aplica orientación EXIF y descarta metadatos EXIF
    let pipeline = sharp(imagenBuffer)
      .rotate()
      .resize(ancho, alto, {
        fit:               "cover",
        position:          "centre",
        withoutEnlargement: true,
      });

    if (formato === "webp") {
      pipeline = pipeline.webp({ quality: calidad });
    } else {
      pipeline = pipeline.jpeg({ quality: calidad, progressive: true });
    }

    const buffer   = await pipeline.toBuffer();
    const ext      = formato === "webp" ? "webp" : "jpg";
    const mimeType = formato === "webp" ? "image/webp" : "image/jpeg";
    const key      = generarKey(productoId, imagenIndex, sufijo, ext);

    try {
      const urlS3 = await subirAS3(buffer, key, mimeType);
      return { sufijo, url: urlS3, bytes: buffer.length };
    } catch (errS3) {
      log("warn", "s3_fallback", { sufijo, error: errS3.message });
      return { sufijo, url: urlOriginal, bytes: buffer.length, s3Fallback: true };
    }
  } catch (err) {
    log("error", `error_tamanio_${sufijo}`, { error: err.message });
    return { sufijo, url: urlOriginal, error: err.message };
  }
}

// ─────────────────────────────────────────────
//  PROCESADOR PRINCIPAL
// ─────────────────────────────────────────────
async function procesarImagen(job) {
  const { url, productoId, imagenIndex = 0 } = job.data;

  log("info", "iniciando", { jobId: job.id, productoId, url: url?.substring(0, 80) });

  const sharp = getSharp();

  // ── Sin Sharp: registrar URL original ────────────────────
  if (!sharp) {
    log("warn", "sharp_no_disponible", {
      jobId: job.id,
      msg:   "Instala sharp para procesamiento real: npm install sharp",
    });
    await Producto.findByIdAndUpdate(productoId, {
      $set: { [`imagenes.${imagenIndex}`]: url },
    });
    return { urls: { original: url }, procesado: false };
  }

  // ── Descargar imagen ──────────────────────────────────────
  await job.progress(10);
  const imagenBuffer = await descargarImagen(url);

  // ── Metadata ──────────────────────────────────────────────
  await job.progress(20);
  const metadata = await sharp(imagenBuffer).metadata();
  log("info", "metadata", {
    jobId:   job.id,
    ancho:   metadata.width,
    alto:    metadata.height,
    formato: metadata.format,
    bytes:   imagenBuffer.length,
  });

  // ── Procesar todos los tamaños EN PARALELO ────────────────
  // MEJORA: Promise.all en vez de for-loop secuencial
  await job.progress(25);
  const resultados = await Promise.all(
    TAMANIOS.map((t) => procesarTamanio(sharp, imagenBuffer, t, productoId, imagenIndex, url))
  );

  // Construir mapa sufijo → url
  const urls = {};
  for (const r of resultados) {
    urls[r.sufijo] = r.url;
    if (r.bytes) {
      log("info", `procesado_${r.sufijo}`, {
        jobId: job.id, sufijo: r.sufijo, bytes: r.bytes, url: r.url?.substring(0, 60),
      });
    }
  }

  // ── Actualizar BD ─────────────────────────────────────────
  await job.progress(90);
  await Producto.findByIdAndUpdate(productoId, {
    $set: {
      [`imagenes.${imagenIndex}`]:         urls.medium || url,
      [`imagenesVariantes.${imagenIndex}`]: urls,
    },
  });

  await job.progress(100);

  log("info", "completado", {
    jobId: job.id, productoId, urlsGeneradas: Object.keys(urls).length,
  });

  return { urls, productoId, imagenIndex, procesado: true };
}

// ─────────────────────────────────────────────
//  REGISTRAR PROCESADOR
// ─────────────────────────────────────────────
function iniciar() {
  if (!imageQueue) {
    log("warn", "cola_deshabilitada", { cola: "imageQueue" });
    return;
  }

  imageQueue.process(2, async (job) => {
    try {
      return await procesarImagen(job);
    } catch (err) {
      log("error", "error_procesando", {
        jobId:   job.id,
        error:   err.message,
        intento: job.attemptsMade,
      });
      throw err;
    }
  });

  log("info", "procesador_iniciado", { cola: "imageQueue", concurrencia: 2 });
}

function log(nivel, accion, datos = {}) {
  const entry = {
    ts:     new Date().toISOString(),
    nivel,
    modulo: "ImageProcessor",
    accion,
    ...datos,
  };
  nivel === "error"
    ? console.error(JSON.stringify(entry))
    : console.log(JSON.stringify(entry));
}

module.exports = { iniciar, procesarImagen, TAMANIOS };
