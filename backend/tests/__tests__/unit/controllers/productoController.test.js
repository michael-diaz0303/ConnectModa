// __tests__/unit/controllers/productoController.test.js

jest.mock('../../../src/models/Producto', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
}));

const Producto = require('../../../src/models/Producto');
const {
  crearProductoController,
  listarProductosController,
  obtenerProductoController,
  actualizarProductoController,
  eliminarProductoController,
} = require('../../../src/controllers/productoController');
const { crearProducto, mongoId } = require('../../fixtures');

const crearReqResMock = (body = {}, params = {}, query = {}, user = {}) => {
  const req = { body, params, query, user: { id: mongoId(), rol: 'taller', ...user } };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return { req, res };
};

const crearQueryEncadenado = (resultado) => ({
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(resultado),
  exec: jest.fn().mockResolvedValue(resultado),
});

// ─── CREAR PRODUCTO ──────────────────────────────────────────────────────────

describe('ProductoController - crearProducto', () => {
  const tallerId = mongoId();

  beforeEach(() => jest.clearAllMocks());

  test('debe crear un producto exitosamente', async () => {
    const datos = crearProducto(tallerId);
    const productoCreado = { _id: mongoId(), ...datos, taller: tallerId };

    Producto.create.mockResolvedValue(productoCreado);

    const { req, res } = crearReqResMock(datos, {}, {}, { id: tallerId, rol: 'taller' });
    await crearProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ producto: expect.any(Object) }) })
    );
  });

  test('debe retornar 400 si falta el nombre del producto', async () => {
    const datos = crearProducto(tallerId);
    delete datos.nombre;

    const { req, res } = crearReqResMock(datos, {}, {}, { id: tallerId, rol: 'taller' });
    await crearProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('debe retornar 400 si el precio es negativo', async () => {
    const datos = { ...crearProducto(tallerId), precio: -1000 };

    const { req, res } = crearReqResMock(datos, {}, {}, { id: tallerId, rol: 'taller' });
    await crearProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('debe retornar 400 si falta la categoría', async () => {
    const datos = crearProducto(tallerId);
    delete datos.categoria;

    const { req, res } = crearReqResMock(datos, {}, {}, { id: tallerId, rol: 'taller' });
    await crearProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('debe retornar 403 si una empresa intenta crear un producto', async () => {
    const datos = crearProducto(tallerId);

    const { req, res } = crearReqResMock(datos, {}, {}, { id: mongoId(), rol: 'empresa' });
    await crearProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('debe asignar el taller del usuario autenticado al producto', async () => {
    const datos = crearProducto(tallerId);
    Producto.create.mockResolvedValue({ _id: mongoId(), ...datos, taller: tallerId });

    const { req, res } = crearReqResMock(datos, {}, {}, { id: tallerId, rol: 'taller' });
    await crearProductoController(req, res);

    expect(Producto.create).toHaveBeenCalledWith(
      expect.objectContaining({ taller: tallerId })
    );
  });
});

// ─── LISTAR PRODUCTOS ────────────────────────────────────────────────────────

describe('ProductoController - listarProductos', () => {
  beforeEach(() => jest.clearAllMocks());

  test('debe listar productos con paginación por defecto', async () => {
    const productos = [crearProducto(mongoId()), crearProducto(mongoId())];
    Producto.find.mockReturnValue(crearQueryEncadenado(productos));
    Producto.countDocuments.mockResolvedValue(2);

    const { req, res } = crearReqResMock({}, {}, {});
    await listarProductosController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          productos: expect.any(Array),
          total: 2,
        }),
      })
    );
  });

  test('debe filtrar productos por categoría', async () => {
    const productos = [crearProducto(mongoId(), { categoria: 'camisas' })];
    Producto.find.mockReturnValue(crearQueryEncadenado(productos));
    Producto.countDocuments.mockResolvedValue(1);

    const { req, res } = crearReqResMock({}, {}, { categoria: 'camisas' });
    await listarProductosController(req, res);

    expect(Producto.find).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'camisas' })
    );
  });

  test('debe filtrar productos por rango de precio', async () => {
    const productos = [crearProducto(mongoId(), { precio: 50000 })];
    Producto.find.mockReturnValue(crearQueryEncadenado(productos));
    Producto.countDocuments.mockResolvedValue(1);

    const { req, res } = crearReqResMock({}, {}, { precioMin: '10000', precioMax: '100000' });
    await listarProductosController(req, res);

    expect(Producto.find).toHaveBeenCalledWith(
      expect.objectContaining({ precio: expect.objectContaining({ $gte: 10000, $lte: 100000 }) })
    );
  });

  test('debe retornar lista vacía si no hay productos', async () => {
    Producto.find.mockReturnValue(crearQueryEncadenado([]));
    Producto.countDocuments.mockResolvedValue(0);

    const { req, res } = crearReqResMock({}, {}, {});
    await listarProductosController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 0 }) })
    );
  });

  test('debe aplicar búsqueda por texto', async () => {
    const productos = [crearProducto(mongoId(), { nombre: 'Camisa Azul Premium' })];
    Producto.find.mockReturnValue(crearQueryEncadenado(productos));
    Producto.countDocuments.mockResolvedValue(1);

    const { req, res } = crearReqResMock({}, {}, { busqueda: 'Camisa Azul' });
    await listarProductosController(req, res);

    expect(Producto.find).toHaveBeenCalledWith(
      expect.objectContaining({ $text: expect.objectContaining({ $search: 'Camisa Azul' }) })
    );
  });
});

// ─── ACTUALIZAR PRODUCTO ─────────────────────────────────────────────────────

describe('ProductoController - actualizarProducto', () => {
  const tallerId = mongoId();
  const productoId = mongoId();

  beforeEach(() => jest.clearAllMocks());

  test('debe actualizar un producto exitosamente', async () => {
    const productoExistente = { _id: productoId, ...crearProducto(tallerId), taller: tallerId };
    const datosActualizados = { nombre: 'Nuevo Nombre', precio: 75000 };
    const productoActualizado = { ...productoExistente, ...datosActualizados };

    Producto.findById.mockResolvedValue(productoExistente);
    Producto.findByIdAndUpdate.mockResolvedValue(productoActualizado);

    const { req, res } = crearReqResMock(datosActualizados, { id: productoId }, {}, { id: tallerId, rol: 'taller' });
    await actualizarProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  test('debe retornar 404 si el producto no existe', async () => {
    Producto.findById.mockResolvedValue(null);

    const { req, res } = crearReqResMock({ nombre: 'Nuevo' }, { id: productoId }, {}, { id: tallerId, rol: 'taller' });
    await actualizarProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('debe retornar 403 si otro taller intenta actualizar el producto', async () => {
    const otroTallerId = mongoId();
    Producto.findById.mockResolvedValue({ _id: productoId, taller: otroTallerId.toString() });

    const { req, res } = crearReqResMock({ nombre: 'Hack' }, { id: productoId }, {}, { id: tallerId, rol: 'taller' });
    await actualizarProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ─── ELIMINAR PRODUCTO ───────────────────────────────────────────────────────

describe('ProductoController - eliminarProducto', () => {
  const tallerId = mongoId();
  const productoId = mongoId();

  beforeEach(() => jest.clearAllMocks());

  test('debe eliminar (desactivar) un producto exitosamente', async () => {
    const productoExistente = { _id: productoId, taller: tallerId, activo: true };
    Producto.findById.mockResolvedValue(productoExistente);
    Producto.findByIdAndUpdate.mockResolvedValue({ ...productoExistente, activo: false });

    const { req, res } = crearReqResMock({}, { id: productoId }, {}, { id: tallerId, rol: 'taller' });
    await eliminarProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, mensaje: expect.any(String) })
    );
  });

  test('debe retornar 404 si el producto no existe', async () => {
    Producto.findById.mockResolvedValue(null);

    const { req, res } = crearReqResMock({}, { id: productoId }, {}, { id: tallerId, rol: 'taller' });
    await eliminarProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('debe retornar 403 si no es el dueño del producto', async () => {
    Producto.findById.mockResolvedValue({ _id: productoId, taller: mongoId() });

    const { req, res } = crearReqResMock({}, { id: productoId }, {}, { id: tallerId, rol: 'taller' });
    await eliminarProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('admin puede eliminar cualquier producto', async () => {
    const productoExistente = { _id: productoId, taller: mongoId(), activo: true };
    Producto.findById.mockResolvedValue(productoExistente);
    Producto.findByIdAndUpdate.mockResolvedValue({ ...productoExistente, activo: false });

    const { req, res } = crearReqResMock({}, { id: productoId }, {}, { id: mongoId(), rol: 'admin' });
    await eliminarProductoController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
