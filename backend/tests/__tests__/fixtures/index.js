// __tests__/fixtures/index.js
// Datos de prueba reutilizables para ConnectModa

const { faker } = require('@faker-js/faker/locale/es');

// ─── USUARIOS ────────────────────────────────────────────────────────────────

const crearUsuarioTaller = (overrides = {}) => ({
  nombre: faker.person.fullName(),
  email: faker.internet.email().toLowerCase(),
  password: 'Password123!',
  telefono: faker.phone.number('3#########'),
  rol: 'taller',
  taller: {
    nombre: faker.company.name() + ' Confecciones',
    descripcion: faker.commerce.productDescription(),
    ciudad: faker.helpers.arrayElement(['Bogotá', 'Medellín', 'Cali', 'Barranquilla']),
    especialidades: faker.helpers.arrayElements(
      ['camisas', 'pantalones', 'vestidos', 'chaquetas', 'uniformes'],
      { min: 1, max: 3 }
    ),
    capacidadProduccion: faker.number.int({ min: 50, max: 500 }),
    certificaciones: [],
  },
  ...overrides,
});

const crearUsuarioEmpresa = (overrides = {}) => ({
  nombre: faker.person.fullName(),
  email: faker.internet.email().toLowerCase(),
  password: 'Password123!',
  telefono: faker.phone.number('3#########'),
  rol: 'empresa',
  empresa: {
    nombre: faker.company.name(),
    descripcion: faker.company.catchPhrase(),
    sector: faker.helpers.arrayElement(['retail', 'exportacion', 'uniformes', 'moda']),
    ciudad: faker.helpers.arrayElement(['Bogotá', 'Medellín', 'Cali']),
    nit: faker.string.numeric(9) + '-' + faker.string.numeric(1),
  },
  ...overrides,
});

const crearAdmin = (overrides = {}) => ({
  nombre: 'Admin ConnectModa',
  email: 'admin@connectmoda.co',
  password: 'AdminPass123!',
  rol: 'admin',
  ...overrides,
});

// ─── PRODUCTOS ───────────────────────────────────────────────────────────────

const crearProducto = (tallerId, overrides = {}) => ({
  nombre: faker.commerce.productName(),
  descripcion: faker.commerce.productDescription(),
  categoria: faker.helpers.arrayElement([
    'camisas', 'pantalones', 'vestidos', 'chaquetas',
    'uniformes', 'ropa-deportiva', 'accesorios'
  ]),
  precio: parseFloat(faker.commerce.price({ min: 15000, max: 500000 })),
  precioMayoreo: parseFloat(faker.commerce.price({ min: 10000, max: 400000 })),
  cantidadMinimaMayoreo: faker.number.int({ min: 5, max: 50 }),
  taller: tallerId || faker.database.mongodbObjectId(),
  stock: faker.number.int({ min: 0, max: 200 }),
  imagenes: [
    { url: faker.image.url(), publica: true },
  ],
  tallas: faker.helpers.arrayElements(['XS', 'S', 'M', 'L', 'XL', 'XXL'], { min: 2, max: 4 }),
  colores: faker.helpers.arrayElements(['negro', 'blanco', 'azul', 'rojo', 'gris'], { min: 1, max: 3 }),
  tiempoProduccion: faker.number.int({ min: 3, max: 30 }),
  activo: true,
  ...overrides,
});

// ─── ÓRDENES ─────────────────────────────────────────────────────────────────

const crearOrden = (empresaId, tallererId, productoId, overrides = {}) => ({
  empresa: empresaId || faker.database.mongodbObjectId(),
  taller: tallererId || faker.database.mongodbObjectId(),
  items: [
    {
      producto: productoId || faker.database.mongodbObjectId(),
      cantidad: faker.number.int({ min: 1, max: 20 }),
      precio: parseFloat(faker.commerce.price({ min: 15000, max: 200000 })),
      talla: faker.helpers.arrayElement(['S', 'M', 'L', 'XL']),
      color: faker.helpers.arrayElement(['negro', 'blanco', 'azul']),
    },
  ],
  estado: 'pendiente',
  metodoPago: faker.helpers.arrayElement(['wompi', 'transferencia', 'contraentrega']),
  direccionEntrega: {
    calle: faker.location.streetAddress(),
    ciudad: faker.location.city(),
    departamento: faker.helpers.arrayElement(['Cundinamarca', 'Antioquia', 'Valle']),
    codigoPostal: faker.location.zipCode('######'),
  },
  notas: faker.lorem.sentence(),
  ...overrides,
});

// ─── TOKENS JWT FALSOS ────────────────────────────────────────────────────────

const crearTokenFalso = () => 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0YWJjZGVmMTIzNDU2Nzg5MCIsInJvbCI6InRhbGxlciIsImlhdCI6MTYwMDAwMDAwMH0.test_signature';

// ─── IDs MONGODB FALSOS ───────────────────────────────────────────────────────

const mongoId = () => faker.database.mongodbObjectId();

// ─── DATOS WOMPI FALSOS ───────────────────────────────────────────────────────

const crearPaymentIntent = (overrides = {}) => ({
  id: 'pi_' + faker.string.alphanumeric(24),
  client_secret: 'pi_' + faker.string.alphanumeric(24) + '_secret_' + faker.string.alphanumeric(16),
  status: 'requires_payment_method',
  amount: faker.number.int({ min: 10000, max: 10000000 }),
  currency: 'cop',
  ...overrides,
});

module.exports = {
  crearUsuarioTaller,
  crearUsuarioEmpresa,
  crearAdmin,
  crearProducto,
  crearOrden,
  crearTokenFalso,
  crearPaymentIntent,
  mongoId,
};
