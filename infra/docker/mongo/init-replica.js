// docker/mongo/init-replica.js
// Inicializa el Replica Set de MongoDB para ConnectModa

// Esperar a que el proceso esté listo
sleep(2000);

try {
  const status = rs.status();
  print('Replica set ya inicializado:', status.set);
} catch (e) {
  // Inicializar replica set por primera vez
  print('Inicializando replica set rs0...');

  const result = rs.initiate({
    _id: 'rs0',
    members: [
      {
        _id: 0,
        host: 'mongo-primary:27017',
        priority: 3,       // Mayor prioridad = preferido como primary
      },
      {
        _id: 1,
        host: 'mongo-secondary1:27017',
        priority: 1,
      },
      {
        _id: 2,
        host: 'mongo-secondary2:27017',
        priority: 1,
      },
    ],
    settings: {
      heartbeatTimeoutSecs: 10,
      electionTimeoutMillis: 10000,
      // Requerir mayoría para writes (garantiza durabilidad)
      getLastErrorDefaults: { w: 'majority', wtimeout: 5000 },
    },
  });

  print('Replica set iniciado:', JSON.stringify(result));

  // Esperar a que el primary esté listo
  let attempts = 0;
  while (attempts < 30) {
    try {
      const primary = rs.isMaster();
      if (primary.ismaster) {
        print('✅ Primary listo en: ' + primary.me);
        break;
      }
    } catch (err) {}
    sleep(2000);
    attempts++;
  }
}

// Crear usuario de aplicación en la BD de producción
const adminDb = db.getSiblingDB('admin');
adminDb.auth(process.env.MONGO_ROOT_USER || 'admin', process.env.MONGO_ROOT_PASS || 'pass');

const connectmodaDb = db.getSiblingDB('connectmoda');
try {
  connectmodaDb.createUser({
    user: 'connectmoda_app',
    pwd: process.env.MONGO_APP_PASS || 'app_pass_change_me',
    roles: [
      { role: 'readWrite', db: 'connectmoda' },
    ],
  });
  print('✅ Usuario connectmoda_app creado');
} catch (e) {
  print('Usuario ya existe o error:', e.message);
}

// Índices de producción
connectmodaDb.usuarios.createIndex({ email: 1 }, { unique: true, background: true });
connectmodaDb.usuarios.createIndex({ rol: 1 }, { background: true });
connectmodaDb.usuarios.createIndex({ createdAt: -1 }, { background: true });

connectmodaDb.productos.createIndex(
  { nombre: 'text', descripcion: 'text', categoria: 'text' },
  { weights: { nombre: 10, categoria: 5, descripcion: 1 }, background: true }
);
connectmodaDb.productos.createIndex({ categoria: 1, precio: 1 }, { background: true });
connectmodaDb.productos.createIndex({ taller: 1, activo: 1 }, { background: true });
connectmodaDb.productos.createIndex({ precio: 1 }, { background: true });
connectmodaDb.productos.createIndex({ createdAt: -1 }, { background: true });

connectmodaDb.ordenes.createIndex({ empresa: 1, estado: 1, createdAt: -1 }, { background: true });
connectmodaDb.ordenes.createIndex({ taller: 1, estado: 1, createdAt: -1 }, { background: true });
connectmodaDb.ordenes.createIndex({ stripePaymentIntentId: 1 }, { sparse: true, background: true });
connectmodaDb.ordenes.createIndex({ createdAt: -1 }, { background: true });

connectmodaDb.carritos.createIndex({ usuario: 1 }, { unique: true, background: true });
connectmodaDb.carritos.createIndex({ expiraEn: 1 }, { expireAfterSeconds: 0, background: true });

print('✅ Índices creados correctamente');
print('✅ MongoDB inicializado para ConnectModa');
