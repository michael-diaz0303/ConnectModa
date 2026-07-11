// src/services/queue/queueService.js
// ConnectModa — Servicio de cola de mensajes con RabbitMQ
// Maneja: órdenes, notificaciones, pagos

const amqplib = require('amqplib');
const logger = require('../../utils/logger');

const EXCHANGES = {
  ORDERS: 'conectmoda.orders',
  NOTIFICATIONS: 'connectmoda.notifications',
  PAYMENTS: 'connectmoda.payments',
};

const ROUTING_KEYS = {
  ORDER_CREATED: 'order.created',
  ORDER_PAID: 'order.paid',
  ORDER_SHIPPED: 'order.shipped',
  WOMPI_WEBHOOK: 'wompi.webhook',
};

class QueueService {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.reconnectTimeout = null;
    this.isConnecting = false;
  }

  // ─── Conectar ─────────────────────────────────────────────────────────────
  async connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const url = process.env.RABBITMQ_URL || 'amqp://connectmoda:pass@localhost:5672/connectmoda';
      this.connection = await amqplib.connect(url, {
        heartbeat: 60,
        timeout: 10000,
      });

      this.connection.on('error', (err) => {
        logger.error('RabbitMQ connection error:', err.message);
        this._scheduleReconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed — reconectando...');
        this._scheduleReconnect();
      });

      this.channel = await this.connection.createConfirmChannel();
      this.channel.prefetch(10); // Procesar máximo 10 mensajes a la vez por consumer

      this.channel.on('error', (err) => {
        logger.error('RabbitMQ channel error:', err.message);
      });

      this.isConnecting = false;
      logger.info('✅ RabbitMQ conectado');
    } catch (err) {
      this.isConnecting = false;
      logger.error('Error conectando a RabbitMQ:', err.message);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect(delay = 5000) {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      await this.connect();
    }, delay);
  }

  // ─── Publicar mensaje ────────────────────────────────────────────────────
  async publish(exchange, routingKey, data, options = {}) {
    if (!this.channel) {
      throw new Error('RabbitMQ no conectado');
    }

    const message = Buffer.from(JSON.stringify({
      ...data,
      _meta: {
        timestamp: new Date().toISOString(),
        routingKey,
        version: '1.0',
      },
    }));

    return new Promise((resolve, reject) => {
      this.channel.publish(
        exchange,
        routingKey,
        message,
        {
          persistent: true,           // Sobrevive reinicios del broker
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          timestamp: Math.floor(Date.now() / 1000),
          ...options,
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // ─── Suscribirse a una cola ──────────────────────────────────────────────
  async consume(queueName, handler, options = {}) {
    if (!this.channel) throw new Error('RabbitMQ no conectado');

    await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) return;

        let data;
        try {
          data = JSON.parse(msg.content.toString());
        } catch (err) {
          logger.error(`Mensaje inválido en ${queueName}:`, msg.content.toString());
          this.channel.nack(msg, false, false); // Rechazar sin reencolar
          return;
        }

        try {
          await handler(data, msg);
          this.channel.ack(msg); // Confirmar procesamiento exitoso
        } catch (err) {
          logger.error(`Error procesando mensaje de ${queueName}:`, err.message);

          const retries = (msg.properties.headers?.retries || 0) + 1;
          const maxRetries = options.maxRetries || 3;

          if (retries < maxRetries) {
            // Reencolar con contador de reintentos
            setTimeout(() => {
              this.channel.nack(msg, false, true);
            }, Math.pow(2, retries) * 1000); // Backoff exponencial
          } else {
            logger.warn(`Mensaje enviado a DLQ después de ${maxRetries} intentos`);
            this.channel.nack(msg, false, false); // Enviar a DLQ
          }
        }
      },
      { noAck: false, ...options }
    );

    logger.info(`Consumidor registrado en cola: ${queueName}`);
  }

  // ─── Helpers específicos de ConnectModa ──────────────────────────────────

  async publishOrderCreated(orden) {
    return this.publish(EXCHANGES.ORDERS, ROUTING_KEYS.ORDER_CREATED, {
      ordenId: orden._id.toString(),
      empresaId: orden.empresa.toString(),
      tallerId: orden.taller.toString(),
      total: orden.total,
      items: orden.items.length,
    });
  }

  async publishOrderPaid(ordenId, paymentIntentId) {
    return this.publish(EXCHANGES.ORDERS, ROUTING_KEYS.ORDER_PAID, {
      ordenId,
      paymentIntentId,
      paidAt: new Date().toISOString(),
    });
  }

  async publishNotification(payload) {
    return this.publish(EXCHANGES.NOTIFICATIONS, '', {
      tipo: payload.tipo,       // 'nueva_orden' | 'pago_confirmado' | 'envio' etc.
      destinatarioId: payload.destinatarioId,
      destinatarioEmail: payload.destinatarioEmail,
      asunto: payload.asunto,
      contenido: payload.contenido,
      datos: payload.datos || {},
    });
  }

  async publishWompiWebhook(evento) {
    return this.publish(EXCHANGES.PAYMENTS, ROUTING_KEYS.WOMPI_WEBHOOK, {
      tipo: evento.type,
      paymentIntentId: evento.data?.object?.id,
      status: evento.data?.object?.status,
      amount: evento.data?.object?.amount,
    });
  }

  // ─── Desconectar ─────────────────────────────────────────────────────────
  async disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      logger.info('RabbitMQ desconectado');
    } catch (err) {
      logger.error('Error desconectando RabbitMQ:', err.message);
    }
  }
}

// Singleton
const queueService = new QueueService();

module.exports = { queueService, EXCHANGES, ROUTING_KEYS };
