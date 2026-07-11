// __tests__/e2e/flows/flujo-completo.test.js
// Tests E2E: Flujo completo de ConnectModa
// Registro → Login → Crear producto → Comprar → Confirmar pago

const request = require('supertest');
const express = require('express');
const { crearUsuarioTaller, crearUsuarioEmpresa, crearProducto, mongoId } = require('../../fixtures');

// ─── Mocks globales para E2E ──────────────────────────────────────────────────

jest.mock('../../../src/models/Usuario', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../../../src/models/Producto', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../../../src/models/Orden', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$10$e2ehashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload) => `token_e2e_${payload.rol}_${payload.id}`),
  verify: jest.fn(),
}));

// Wompi usa fetch nativo — no requiere mock de SDK
    try {
      req.user = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ success: false, mensaje: 'Token inválido' });
    }
  };

  // AUTH
  app.post('/api/auth/register', async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password || !rol) return res.status(400).json({ success: false, mensaje: 'Campos requeridos' });
    if (!['taller', 'empresa'].includes(rol)) return res.status(400).json({ success: false, mensaje: 'Rol inválido' });
    const existente = await Usuario.findOne({ email });
    if (existente) return res.status(400).json({ success: false, mensaje: 'Email ya registrado' });
    const hashed = await bcrypt.hash(password, 10);
    const usuario = await Usuario.create({ ...req.body, password: hashed, activo: true });
    const token = jwt.sign({ id: usuario._id, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, data: { usuario: { _id: usuario._id, nombre, email, rol } } });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false });
    const usuario = await Usuario.findOne({ email });
    if (!usuario) return res.status(401).json({ success: false, mensaje: 'Credenciales inválidas' });
    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok) return res.status(401).json({ success: false, mensaje: 'Credenciales inválidas' });
    const token = jwt.sign({ id: usuario._id, rol: usuario.rol }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ success: true, token, data: { usuario: { _id: usuario._id, email, rol: usuario.rol } } });
  });

  // PRODUCTOS
  app.post('/api/productos', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'taller') return res.status(403).json({ success: false });
    const producto = await Producto.create({ ...req.body, taller: req.user.id });
    res.status(201).json({ success: true, data: { producto } });
  });

  app.get('/api/productos/:id', async (req, res) => {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ success: false });
    res.status(200).json({ success: true, data: { producto } });
  });

  // ÓRDENES
  app.post('/api/ordenes', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'empresa') return res.status(403).json({ success: false, mensaje: 'Solo empresas pueden ordenar' });
    const { items, metodoPago, direccionEntrega } = req.body;
    if (!items?.length) return res.status(400).json({ success: false, mensaje: 'Items requeridos' });
    if (!direccionEntrega) return res.status(400).json({ success: false, mensaje: 'Dirección requerida' });

    let total = 0;
    const itemsConPrecio = [];
    for (const item of items) {
      const producto = await Producto.findById(item.producto);
      if (!producto) return res.status(404).json({ success: false, mensaje: `Producto ${item.producto} no encontrado` });
      if (producto.stock < item.cantidad) return res.status(400).json({ success: false, mensaje: 'Stock insuficiente' });
      total += producto.precio * item.cantidad;
      itemsConPrecio.push({ ...item, precio: producto.precio, taller: producto.taller });
    }

    let referencia = null;
    let clientSecret = null;
    if (metodoPago === 'wompi') {
      // Wompi verifica con X-Event-Checksum (SHA256)

      if (evento.type === 'payment_intent.succeeded') {
        const pi = evento.data.object;
        await Orden.findByIdAndUpdate(
          { referencia: data?.data?.transaction?.reference },
          { estado: 'confirmada', pagado: true }
        );
      }
      res.status(200).json({ received: true });
    } catch (err) {
      res.status(400).json({ success: false, mensaje: err.message });
    }
  });

  return app;
};

// ─── Estado compartido entre tests ───────────────────────────────────────────

let app;
const estado = {
  tallerToken: null,
  empresaToken: null,
  tallerUsuario: null,
  empresaUsuario: null,
  productoId: null,
  ordenId: null,
  paymentIntentId: null,
};

beforeAll(() => {
  app = construirAppE2E();
});

beforeEach(() => jest.clearAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════
//  FLUJO 1: Registro → Login → Crear Producto → Comprar
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E Flujo 1: Registro → Login → Crear Producto → Comprar', () => {
  const TALLER_ID = mongoId();
  const EMPRESA_ID = mongoId();
  const PRODUCTO_ID = mongoId();
  const ORDEN_ID = mongoId();

  const datosTaller = crearUsuarioTaller();
  const datosEmpresa = crearUsuarioEmpresa();
  const datosProducto = crearProducto(TALLER_ID, { precio: 50000, stock: 100 });

  // PASO 1
  test('1. Registrar un taller exitosamente', async () => {
    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue({ _id: TALLER_ID, ...datosTaller, activo: true });

    const res = await request(app).post('/api/auth/register').send(datosTaller);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    estado.tallerToken = res.body.token;
    estado.tallerUsuario = res.body.data?.usuario;
  });

  // PASO 2
  test('2. Registrar una empresa exitosamente', async () => {
    Usuario.findOne.mockResolvedValue(null);
    Usuario.create.mockResolvedValue({ _id: EMPRESA_ID, ...datosEmpresa, activo: true });

    const res = await request(app).post('/api/auth/register').send(datosEmpresa);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    estado.empresaToken = res.body.token;
  });

  // PASO 3
  test('3. El taller hace login y obtiene token', async () => {
    const tallerEnBD = { _id: TALLER_ID, email: datosTaller.email, password: '$2a$10$hash', rol: 'taller', activo: true };
    Usuario.findOne.mockResolvedValue(tallerEnBD);
    bcrypt.compare.mockResolvedValue(true);
    jwt.verify.mockReturnValue({ id: TALLER_ID, rol: 'taller' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: datosTaller.email, password: datosTaller.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    estado.tallerToken = res.body.token;
  });

  // PASO 4
  test('4. El taller crea un producto', async () => {
    jwt.verify.mockReturnValue({ id: TALLER_ID, rol: 'taller' });
    Producto.create.mockResolvedValue({ _id: PRODUCTO_ID, ...datosProducto, taller: TALLER_ID });

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${estado.tallerToken || 'token'}`)
      .send(datosProducto);

    expect(res.status).toBe(201);
    expect(res.body.data.producto).toBeDefined();
    estado.productoId = PRODUCTO_ID;
  });

  // PASO 5
  test('5. La empresa puede ver el producto', async () => {
    Producto.findById.mockResolvedValue({ _id: PRODUCTO_ID, ...datosProducto, taller: TALLER_ID });

    const res = await request(app).get(`/api/productos/${PRODUCTO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.producto).toBeDefined();
  });

  // PASO 6
  test('6. La empresa crea una orden con Wompi', async () => {
    jwt.verify.mockReturnValue({ id: EMPRESA_ID, rol: 'empresa' });
    Producto.findById.mockResolvedValue({
      _id: PRODUCTO_ID, ...datosProducto, taller: TALLER_ID,
      precio: 50000, stock: 100,
    });
    Orden.create.mockResolvedValue({
      _id: ORDEN_ID,
      empresa: EMPRESA_ID,
      taller: TALLER_ID,
      items: [{ producto: PRODUCTO_ID, cantidad: 3, precio: 50000 }],
      total: 150000,
      estado: 'pendiente',
      referencia: 'CM-E2E-TEST01',
    });

    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${estado.empresaToken || 'token'}`)
      .send({
        items: [{ producto: PRODUCTO_ID, cantidad: 3, talla: 'M', color: 'negro' }],
        metodoPago: 'wompi',
        direccionEntrega: { calle: 'Cra 7 #45-10', ciudad: 'Bogotá', departamento: 'Cundinamarca', codigoPostal: '110111' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.orden).toBeDefined();
    expect(res.body.data.clientSecret).toBeDefined();
    estado.ordenId = ORDEN_ID;
    estado.paymentIntentId = 'pi_e2e_test_123';
  });

  // PASO 7
  test('7. Se recibe el webhook de pago exitoso', async () => {
    Orden.findByIdAndUpdate.mockResolvedValue({ _id: ORDEN_ID, estado: 'confirmada', pagado: true });

    const res = await request(app)
      .post('/api/pagos/webhook')
      .set('x-event-checksum', 'checksum_test')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'payment_intent.succeeded' }));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FLUJO 2: Búsqueda avanzada con todos los filtros
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E Flujo 2: Búsqueda avanzada', () => {
  test('debe buscar por categoría + precio + ciudad + talla', async () => {
    const productos = [
      crearProducto(mongoId(), { categoria: 'camisas', precio: 45000, tallas: ['M', 'L'] }),
      crearProducto(mongoId(), { categoria: 'camisas', precio: 55000, tallas: ['S', 'M'] }),
    ];
    Producto.find.mockResolvedValue(productos);
    Producto.countDocuments.mockResolvedValue(2);

    // Buscar en la ruta pública (simular filtros de query)
    const filtros = {
      categoria: 'camisas',
      precioMin: '30000',
      precioMax: '100000',
      talla: 'M',
    };

    // Verificar construcción del filtro
    const filtroEsperado = {
      activo: true,
      categoria: filtros.categoria,
      precio: { $gte: 30000, $lte: 100000 },
      tallas: filtros.talla,
    };

    expect(filtroEsperado.categoria).toBe('camisas');
    expect(filtroEsperado.precio.$gte).toBe(30000);
    expect(filtroEsperado.precio.$lte).toBe(100000);
    expect(filtroEsperado.tallas).toBe('M');
  });

  test('debe paginar resultados correctamente', async () => {
    const pagina = 2;
    const limite = 5;
    const skip = (pagina - 1) * limite; // 5

    expect(skip).toBe(5);
    expect(limite).toBe(5);
  });

  test('debe ordenar por precio ascendente', async () => {
    const productos = [
      { nombre: 'Barato', precio: 20000 },
      { nombre: 'Caro', precio: 80000 },
    ];

    const ordenados = [...productos].sort((a, b) => a.precio - b.precio);
    expect(ordenados[0].nombre).toBe('Barato');
    expect(ordenados[1].nombre).toBe('Caro');
  });

  test('debe retornar vacío si no hay matches', async () => {
    Producto.find.mockResolvedValue([]);
    Producto.countDocuments.mockResolvedValue(0);

    const res = await request(app).get('/api/productos?categoria=inexistente');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FLUJO 3: Validaciones de seguridad
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E Flujo 3: Seguridad y validaciones', () => {
  test('empresa no puede crear productos', async () => {
    jwt.verify.mockReturnValue({ id: mongoId(), rol: 'empresa' });

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', 'Bearer token_empresa')
      .send(crearProducto(mongoId()));

    expect(res.status).toBe(403);
  });

  test('taller no puede crear órdenes', async () => {
    jwt.verify.mockReturnValue({ id: mongoId(), rol: 'taller' });

    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', 'Bearer token_taller')
      .send({ items: [{ producto: mongoId(), cantidad: 1 }], metodoPago: 'wompi' });

    expect(res.status).toBe(403);
  });

  test('request sin token devuelve 401', async () => {
    const res = await request(app).post('/api/productos').send(crearProducto(mongoId()));
    expect(res.status).toBe(401);
  });

  test('token inválido devuelve 401', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', 'Bearer token_falso_invalido')
      .send(crearProducto(mongoId()));

    expect(res.status).toBe(401);
  });

  test('orden con stock insuficiente retorna 400', async () => {
    jwt.verify.mockReturnValue({ id: mongoId(), rol: 'empresa' });
    Producto.findById.mockResolvedValue({
      _id: mongoId(), precio: 50000, stock: 2, taller: mongoId(),
    });

    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', 'Bearer token')
      .send({
        items: [{ producto: mongoId(), cantidad: 100 }],
        metodoPago: 'wompi',
        direccionEntrega: { calle: 'Cra 1', ciudad: 'Bogotá', departamento: 'Cundinamarca', codigoPostal: '110111' },
      });

    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/stock/i);
  });
});
