const mongoose = require('mongoose');
const logger   = require('../utils/logger');

// ── OPCIONES DE CONEXIÓN ───────────────────────────────────────────────────────
const MONGOOSE_OPTIONS = {
  serverSelectionTimeoutMS: 5000,   // Tiempo máximo para seleccionar servidor
  socketTimeoutMS:          45000,  // Tiempo máximo de inactividad del socket
  maxPoolSize:              10,     // Máximo de conexiones simultáneas
  minPoolSize:              2,      // Mínimo de conexiones mantenidas
  connectTimeoutMS:         10000,  // Tiempo máximo de conexión inicial
};

// ── ESTADO DE LA CONEXIÓN ──────────────────────────────────────────────────────
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS     = 5000;

// ── FUNCIÓN PRINCIPAL DE CONEXIÓN ─────────────────────────────────────────────
const connectDB = async () => {
  if (isConnected) {
    logger.info('MongoDB: Ya existe una conexión activa.');
    return;
  }

  const uri = process.env.NODE_ENV === 'production'
    ? process.env.MONGODB_URI_PROD
    : process.env.MONGODB_URI;

  if (!uri) {
    logger.error('MongoDB: URI no definida en las variables de entorno.');
    process.exit(1);
  }

  try {
    logger.info(`MongoDB: Conectando en modo [${process.env.NODE_ENV}]...`);
    await mongoose.connect(uri, MONGOOSE_OPTIONS);

    isConnected       = true;
    reconnectAttempts = 0;
    logger.info(`MongoDB: Conexión exitosa → ${mongoose.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB: Error al conectar → ${error.message}`);
    await handleReconnect();
  }
};

// ── RECONEXIÓN AUTOMÁTICA ──────────────────────────────────────────────────────
const handleReconnect = async () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error(`MongoDB: Se alcanzó el límite de ${MAX_RECONNECT_ATTEMPTS} intentos. Cerrando proceso.`);
    process.exit(1);
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * reconnectAttempts; // Backoff incremental

  logger.warn(`MongoDB: Reintentando conexión (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) en ${delay / 1000}s...`);

  await new Promise(resolve => setTimeout(resolve, delay));
  await connectDB();
};

// ── CIERRE LIMPIO ──────────────────────────────────────────────────────────────
const disconnectDB = async () => {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
  logger.info('MongoDB: Conexión cerrada correctamente.');
};

// ── EVENTOS DE MONGOOSE ────────────────────────────────────────────────────────
mongoose.connection.on('connected', () => {
  isConnected = true;
  logger.info('MongoDB [evento]: Conexión establecida.');
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB [evento]: Conexión perdida.');
  if (process.env.NODE_ENV !== 'test') handleReconnect();
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB [evento]: Error → ${err.message}`);
});

// ── CIERRE AL TERMINAR EL PROCESO ─────────────────────────────────────────────
process.on('SIGINT',  async () => { await disconnectDB(); process.exit(0); });
process.on('SIGTERM', async () => { await disconnectDB(); process.exit(0); });

module.exports = { connectDB, disconnectDB };