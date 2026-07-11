// docker/mongo-init.js
// Script de inicialización de MongoDB — se ejecuta al crear el contenedor por primera vez

db = db.getSiblingDB('connectmoda_dev');

// Crear usuario de aplicación con permisos restringidos
db.createUser({
  user: 'connectmoda_app',
  pwd: 'connectmoda_dev_pass',
  roles: [{ role: 'readWrite', db: 'connectmoda_dev' }],
});

// Crear índices básicos
db.usuarios.createIndex({ email: 1 }, { unique: true });
db.usuarios.createIndex({ rol: 1 });
db.productos.createIndex({ nombre: 'text', descripcion: 'text' });
db.productos.createIndex({ categoria: 1, precio: 1 });
db.productos.createIndex({ taller: 1 });
db.ordenes.createIndex({ empresa: 1, estado: 1 });
db.ordenes.createIndex({ taller: 1, estado: 1 });
db.ordenes.createIndex({ stripePaymentIntentId: 1 });
db.carritos.createIndex({ usuario: 1 }, { unique: true });
db.carritos.createIndex({ expiraEn: 1 }, { expireAfterSeconds: 0 });

print('✅ MongoDB inicializado para ConnectModa dev');
