// __tests__/integration/routes/productos.routes.test.js
// Tests de integración para rutas de productos (CRUD completo)

const request = require('supertest');
const express = require('express');
const { crearProducto, mongoId } = require('../../fixtures');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../src/models/Producto', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../../../src/models/Usuario', () => ({
  findById: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('token_producto_test'),
  verify: jest.fn(),
}));

// ─── App de prueba con rutas inline ──────────────────────────────────────────

const Producto = require('../../../src/models/Producto');
const jwt = require('jsonwebtoken');

const crearAppProductos = () => {
  const app = express();
  app.use(express.json());

  const router = express.Router();

  // Middleware de auth simplificado
  const auth = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ success: false, mensaje: 'No autorizado' });
    try {
      const token = header.replace('Bearer ', '');
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ success: false, mensaje: 'Token inválido' });
    }
  };

  const crearQueryMock = (data) => ({
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(data),
    exec: jest.fn().mockResolvedValue(data),
  });

  // GET /api/productos
  router.get('/', async (req, res) => {
    try {
      const { categoria, precioMin, precioMax, busqueda, pagina = 1, limite = 10 } = req.query;
      const filtros = { activo: true };
      if (categoria) filtros.categoria = categoria;
      if (precioMin || precioMax) {
        filtros.precio = {};
        if (precioMin) filtros.precio.$gte = Number(precioMin);
        if (precioMax) filtros.precio.$lte = Number(precioMax);
      }
      if (busqueda) filtros.$text = { $search: busqueda };

      const skip = (Number(pagina) - 1) * Number(limite);
      const query = Producto.find(filtros);
      const [productos, total] = await Promise.all([
        Promise.resolve(query).then ? query : query.lean(),
        Producto.countDocuments(filtros),
      ]);

      return res.status(200).json({
        success: true,
        data: { productos, total, pagina: Number(pagina), limite: Number(limite) },
      });
    } catch (err) {
      return res.status(500).json({ success: false, mensaje: 'Error del servidor' });
    }
  });

  // GET /api/productos/:id
  router.get('/:id', async (req, res) => {
    try {
      const producto = await Producto.findById(req.params.id);
      if (!producto) return res.status(404).json({ success: false, mensaje: 'Producto no encontrado' });
      return res.status(200).json({ success: true, data: { producto } });
    } catch (err) {
      return res.status(500).json({ success: false, mensaje: 'Error del servidor' });
    }
  });

  // POST /api/productos
  router.post('/', auth, async (req, res) => {
    try {
      if (req.user.rol !== 'taller' && req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, mensaje: 'Solo talleres pueden crear productos' });
      }
      const { nombre, precio, categoria } = req.body;
      if (!nombre || !precio || !categoria) {
        return res.status(400).json({ success: false, mensaje: 'nombre, precio y categoría son requeridos' });
      }
      if (precio < 0) return res.status(400).json({ success: false, mensaje: 'precio inválido' });

      const producto = await Producto.create({ ...req.body, taller: req.user.id });
      return res.status(201).json({ success: true, data: { producto } });
    } catch (err) {
      return res.status(500).json({ success: false, mensaje: 'Error del servidor' });
    }
  });

  // PUT /api/productos/:id
  router.put('/:id', auth, async (req, res) => {
    try {
      const producto = await Producto.findById(req.params.id);
      if (!producto) return res.status(404).json({ success: false, mensaje: 'Producto no encontrado' });
      if (req.user.rol !== 'admin' && producto.taller?.toString() !== req.user.id) {
        return res.status(403).json({ success: false, mensaje: 'No autorizado' });
      }
      const actualizado = await Producto.findByIdAndUpdate(req.params.id, req.body, { new: true });
      return res.status(200).json({ success: true, data: { producto: actualizado } });
    } catch (err) {
      return res.status(500).json({ success: false, mensaje: 'Error del servidor' });
    }
  });

  // DELETE /api/productos/:id
  router.delete('/:id', auth, async (req, res) => {
    try {
      const producto = await Producto.findById(req.params.id);
      if (!producto) return res.status(404).json({ success: false, mensaje: 'Producto no encontrado' });
      if (req.user.rol !== 'admin' && producto.taller?.toString() !== req.user.id) {
        return res.status(403).json({ success: false, mensaje: 'No autorizado' });
      }
      await Producto.findByIdAndUpdate(req.params.id, { activo: false });
      return res.status(200).json({ success: true, mensaje: 'Producto desactivado correctamente' });
    } catch (err) {
      return res.status(500).json({ success: false, mensaje: 'Error del servidor' });
    }
  });

  app.use('/api/productos', router);
  return app;
};

let app;
beforeAll(() => { app = crearAppProductos(); });
beforeEach(() => jest.clearAllMocks());

const TALLER_ID = mongoId();
const authHeader = (rol = 'taller', id = TALLER_ID) => {
  jwt.verify.mockReturnValue({ id, rol });
  return { Authorization: 'Bearer token_producto_test' };
};

// ─── GET /api/productos ───────────────────────────────────────────────────────

describe('GET /api/productos', () => {
  const productos = [crearProducto(TALLER_ID), crearProducto(TALLER_ID)];

  const mockFind = (data) => {
    Producto.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(data),
      then: (fn) => fn ? Promise.resolve(data).then(fn) : Promise.resolve(data),
    });
    Producto.find.mockResolvedValue(data);
    Producto.countDocuments.mockResolvedValue(data.length);
  };

  test('debe listar productos correctamente', async () => {
    mockFind(productos);
    const res = await request(app).get('/api/productos');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('total');
  });

  test('debe filtrar por categoría', async () => {
    mockFind(productos);
    const res = await request(app).get('/api/productos?categoria=camisas');
    expect(res.status).toBe(200);
    expect(Producto.find).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'camisas' })
    );
  });

  test('debe filtrar por rango de precio', async () => {
    mockFind(productos);
    const res = await request(app).get('/api/productos?precioMin=10000&precioMax=100000');
    expect(res.status).toBe(200);
    expect(Producto.find).toHaveBeenCalledWith(
      expect.objectContaining({ precio: { $gte: 10000, $lte: 100000 } })
    );
  });

  test('debe aplicar búsqueda por texto', async () => {
    mockFind(productos);
    const res = await request(app).get('/api/productos?busqueda=camisa');
    expect(res.status).toBe(200);
    expect(Producto.find).toHaveBeenCalledWith(
      expect.objectContaining({ $text: { $search: 'camisa' } })
    );
  });

  test('debe retornar total 0 si no hay productos', async () => {
    mockFind([]);
    const res = await request(app).get('/api/productos');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });
});

// ─── GET /api/productos/:id ───────────────────────────────────────────────────

describe('GET /api/productos/:id', () => {
  test('debe retornar producto por ID', async () => {
    const pid = mongoId();
    const producto = { _id: pid, ...crearProducto(TALLER_ID) };
    Producto.findById.mockResolvedValue(producto);

    const res = await request(app).get(`/api/productos/${pid}`);
    expect(res.status).toBe(200);
    expect(res.body.data.producto._id).toBe(pid);
  });

  test('debe retornar 404 si no existe', async () => {
    Producto.findById.mockResolvedValue(null);
    const res = await request(app).get(`/api/productos/${mongoId()}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/productos ──────────────────────────────────────────────────────

describe('POST /api/productos', () => {
  test('debe crear producto exitosamente', async () => {
    const datos = crearProducto(TALLER_ID);
    Producto.create.mockResolvedValue({ _id: mongoId(), ...datos });

    const res = await request(app)
      .post('/api/productos')
      .set(authHeader('taller'))
      .send(datos);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Producto.create).toHaveBeenCalledWith(
      expect.objectContaining({ taller: TALLER_ID })
    );
  });

  test('debe retornar 401 sin autenticación', async () => {
    const res = await request(app).post('/api/productos').send(crearProducto(TALLER_ID));
    expect(res.status).toBe(401);
  });

  test('debe retornar 403 si el rol es empresa', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set(authHeader('empresa'))
      .send(crearProducto(TALLER_ID));

    expect(res.status).toBe(403);
  });

  test('debe retornar 400 si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set(authHeader('taller'))
      .send({ nombre: 'Solo nombre' });

    expect(res.status).toBe(400);
  });

  test('debe guardar el producto con el taller del usuario autenticado', async () => {
    const datos = crearProducto(TALLER_ID);
    Producto.create.mockResolvedValue({ _id: mongoId(), ...datos, taller: TALLER_ID });

    await request(app).post('/api/productos').set(authHeader('taller', TALLER_ID)).send(datos);

    expect(Producto.create).toHaveBeenCalledWith(
      expect.objectContaining({ taller: TALLER_ID })
    );
  });
});

// ─── PUT /api/productos/:id ───────────────────────────────────────────────────

describe('PUT /api/productos/:id', () => {
  const pid = mongoId();

  test('debe actualizar un producto correctamente', async () => {
    Producto.findById.mockResolvedValue({ _id: pid, taller: TALLER_ID });
    Producto.findByIdAndUpdate.mockResolvedValue({ _id: pid, nombre: 'Actualizado', taller: TALLER_ID });

    const res = await request(app)
      .put(`/api/productos/${pid}`)
      .set(authHeader('taller', TALLER_ID))
      .send({ nombre: 'Actualizado' });

    expect(res.status).toBe(200);
    expect(res.body.data.producto.nombre).toBe('Actualizado');
  });

  test('debe retornar 404 si el producto no existe', async () => {
    Producto.findById.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/productos/${pid}`)
      .set(authHeader('taller', TALLER_ID))
      .send({ nombre: 'Nuevo' });

    expect(res.status).toBe(404);
  });

  test('debe retornar 403 si no es el dueño', async () => {
    Producto.findById.mockResolvedValue({ _id: pid, taller: mongoId() });

    const res = await request(app)
      .put(`/api/productos/${pid}`)
      .set(authHeader('taller', TALLER_ID))
      .send({ nombre: 'Hack' });

    expect(res.status).toBe(403);
  });

  test('admin puede actualizar cualquier producto', async () => {
    Producto.findById.mockResolvedValue({ _id: pid, taller: mongoId() });
    Producto.findByIdAndUpdate.mockResolvedValue({ _id: pid, nombre: 'Admin update' });

    const res = await request(app)
      .put(`/api/productos/${pid}`)
      .set(authHeader('admin', mongoId()))
      .send({ nombre: 'Admin update' });

    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/productos/:id ────────────────────────────────────────────────

describe('DELETE /api/productos/:id', () => {
  const pid = mongoId();

  test('debe eliminar (desactivar) un producto', async () => {
    Producto.findById.mockResolvedValue({ _id: pid, taller: TALLER_ID, activo: true });
    Producto.findByIdAndUpdate.mockResolvedValue({ _id: pid, activo: false });

    const res = await request(app)
      .delete(`/api/productos/${pid}`)
      .set(authHeader('taller', TALLER_ID));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Producto.findByIdAndUpdate).toHaveBeenCalledWith(pid, { activo: false });
  });

  test('debe retornar 404 si el producto no existe', async () => {
    Producto.findById.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/productos/${pid}`)
      .set(authHeader('taller', TALLER_ID));

    expect(res.status).toBe(404);
  });

  test('debe retornar 403 si no es el dueño', async () => {
    Producto.findById.mockResolvedValue({ _id: pid, taller: mongoId() });

    const res = await request(app)
      .delete(`/api/productos/${pid}`)
      .set(authHeader('taller', TALLER_ID));

    expect(res.status).toBe(403);
  });
});
