// src/worker.js
// ConnectModa — Proceso worker separado
// Consume colas de RabbitMQ: emails, notificaciones de órdenes, confirmaciones de pago

require('dotenv').config();
const mongoose = require('mongoose');
const { queueService } = require('./services/queue/queueService');
const { cacheService } = require('./services/cache/cacheService');
const logger = require('./utils/logger');

// ─── Importar modelos ─────────────────────────────────────────────────────────
const Orden = require('./models/Orden');
const Usuario = require('./models/Usuario');

// ─── Handlers de cola ─────────────────────────────────────────────────────────

/**
 * Procesa nueva orden creada
 * - Envía email al taller notificando la orden
 * - Envía email de confirmación a la empresa
 * - Invalida caché de órdenes pendientes
 */
const handleOrderCreated = async (data) => {
  const { ordenId, empresaId, tallerId, total } = data;
  logger.info(`Procesando orden creada: ${ordenId}`);

  const [orden, empresa, taller] = await Promise.all([
    Orden.findById(ordenId).lean(),
    Usuario.findById(empresaId).select('nombre email').lean(),
    Usuario.findById(tallerId).select('nombre email taller').lean(),
  ]);

  if (!orden) {
    logger.warn(`Orden ${ordenId} no encontrada en el worker`);
    return;
  }

  // Enviar email de confirmación a la empresa
  await queueService.publishNotification({
    tipo: 'orden_confirmada',
    destinatarioId: empresaId,
    destinatarioEmail: empresa?.email,
    asunto: `✅ Orden #${ordenId.slice(-6)} confirmada`,
    contenido: `Tu orden por $${(total / 100).toLocaleString('es-CO')} COP ha sido recibida.`,
    datos: { ordenId, total },
  });

  // Notificar al taller
  await queueService.publishNotification({
    tipo: 'nueva_orden_taller',
    destinatarioId: tallerId,
    destinatarioEmail: taller?.email,
    asunto: `🛍️ Nueva orden recibida #${ordenId.slice(-6)}`,
    contenido: `Tienes una nueva orden de ${empresa?.nombre || 'una empresa'}.`,
    datos: { ordenId, empresaNombre: empresa?.nombre },
  });

  // Invalidar caché de órdenes
  await cacheService.del(`ordenes:empresa:${empresaId}`);
  await cacheService.del(`ordenes:taller:${tallerId}`);

  logger.info(`✅ Orden ${ordenId} procesada en worker`);
};

/**
 * Procesa pago confirmado
 * - Actualiza estado de la orden a 'confirmada'
 * - Notifica a empresa y taller
 * - Invalida caché
 */
const handleOrderPaid = async (data) => {
  const { ordenId, paymentIntentId } = data;
  logger.info(`Procesando pago de orden: ${ordenId}`);

  const orden = await Orden.findByIdAndUpdate(
    ordenId,
    { estado: 'confirmada', pagadoEn: new Date(), pagado: true },
    { new: true }
  ).lean();

  if (!orden) {
    logger.warn(`Orden ${ordenId} no encontrada para pago`);
    return;
  }

  // Notificar confirmación de pago
  await queueService.publishNotification({
    tipo: 'pago_confirmado',
    destinatarioId: orden.empresa.toString(),
    destinatarioEmail: null, // El worker de email resolverá el email
    asunto: `💳 Pago confirmado — Orden #${ordenId.slice(-6)}`,
    contenido: 'Tu pago fue procesado exitosamente. El taller comenzará tu pedido pronto.',
    datos: { ordenId, paymentIntentId },
  });

  // Invalidar caché
  await cacheService.del(`orden:${ordenId}`);
  await cacheService.del(`ordenes:empresa:${orden.empresa}`);

  logger.info(`✅ Pago confirmado para orden ${ordenId}`);
};

/**
 * Envía emails de notificación
 */
const handleEmailNotification = async (data) => {
  const { destinatarioEmail, asunto, contenido, tipo, datos } = data;

  if (!destinatarioEmail) {
    // Resolver email si no viene incluido
    if (data.destinatarioId) {
      const usuario = await Usuario.findById(data.destinatarioId).select('email').lean();
      if (!usuario?.email) {
        logger.warn(`Email no encontrado para usuario: ${data.destinatarioId}`);
        return;
      }
      data.destinatarioEmail = usuario.email;
    } else {
      logger.warn('Notificación sin email ni ID de usuario:', tipo);
      return;
    }
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@connectmoda.co',
      to: data.destinatarioEmail,
      subject: asunto,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2c3e50; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">ConnectModa</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <p>${contenido}</p>
            ${datos?.ordenId ? `<p><strong>Número de orden:</strong> #${datos.ordenId.slice(-6)}</p>` : ''}
          </div>
          <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>ConnectModa — Conectando talleres con empresas</p>
          </div>
        </div>
      `,
    });

    logger.info(`✅ Email enviado: ${tipo} → ${data.destinatarioEmail}`);
  } catch (err) {
    logger.error(`Error enviando email ${tipo}:`, err.message);
    throw err; // Reencolar
  }
};

/**
 * Procesa webhooks de Wompi
 */
const handleWompiWebhook = async (data) => {
  const { tipo, paymentIntentId, status } = data;
  logger.info(`Webhook Wompi: ${data?.event} — TX: ${data?.data?.transaction?.id}`);

  if (tipo === 'payment_intent.succeeded' && status === 'succeeded') {
    const orden = await Orden.findOne({ 'pagos.referencia': data?.data?.transaction?.reference }).lean();
    if (orden) {
      await handleOrderPaid({ ordenId: orden._id.toString(), paymentIntentId });
    }
  }

  if (tipo === 'payment_intent.payment_failed') {
    const orden = await Orden.findOneAndUpdate(
      { 'pagos.referencia': data?.data?.transaction?.reference },
      { estado: 'pago_fallido' },
      { new: true }
    ).lean();

    if (orden) {
      await queueService.publishNotification({
        tipo: 'pago_fallido',
        destinatarioId: orden.empresa.toString(),
        destinatarioEmail: null,
        asunto: '❌ Pago fallido — ConnectModa',
        contenido: 'Tu pago no pudo ser procesado. Por favor intenta de nuevo.',
        datos: { ordenId: orden._id.toString() },
      });
    }
  }
};

// ─── Arrancar worker ──────────────────────────────────────────────────────────
const startWorker = async () => {
  logger.info(`🔧 Worker iniciando (ID: ${process.env.NODE_ID || 'worker'})`);

  // Conectar a MongoDB
  await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 5 });
  logger.info('✅ Worker MongoDB conectado');

  // Conectar a Redis
  await cacheService.connect();

  // Conectar a RabbitMQ
  await queueService.connect();

  // Registrar consumers
  await queueService.consume('orders.created',       handleOrderCreated,    { maxRetries: 3 });
  await queueService.consume('orders.paid',          handleOrderPaid,       { maxRetries: 3 });
  await queueService.consume('notifications.email',  handleEmailNotification, { maxRetries: 5 });
  await queueService.consume('payments.webhook',     handleWompiWebhook,   { maxRetries: 3 });

  logger.info('✅ Worker listo — consumiendo colas');

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} — cerrando worker...`);
    await queueService.disconnect();
    await cacheService.disconnect();
    await mongoose.connection.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

startWorker().catch((err) => {
  logger.error('Error fatal en worker:', err);
  process.exit(1);
});
