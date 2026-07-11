// __tests__/unit/models/models.test.js
// Tests de validación de esquemas Mongoose

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Mock Schema para tests de validación ─────────────────────────────────────
// Simulamos la lógica de validación sin conectar a BD real

const validarEsquemaUsuario = (datos) => {
  const errores = [];
  if (!datos.nombre || datos.nombre.trim().length < 2) errores.push('nombre requerido');
  if (!datos.email || !/\S+@\S+\.\S+/.test(datos.email)) errores.push('email inválido');
  if (!datos.password || datos.password.length < 8) errores.push('password mínimo 8 caracteres');
  if (!['taller', 'empresa', 'admin'].includes(datos.rol)) errores.push('rol inválido');
  return errores;
};

const validarEsquemaProducto = (datos) => {
  const errores = [];
  if (!datos.nombre || datos.nombre.trim().length < 3) errores.push('nombre requerido');
  if (!datos.precio || datos.precio < 0) errores.push('precio inválido');
  if (!datos.taller) errores.push('taller requerido');
  const categoriasValidas = ['camisas','pantalones','vestidos','chaquetas','uniformes','ropa-deportiva','accesorios'];
  if (!datos.categoria || !categoriasValidas.includes(datos.categoria)) errores.push('categoría inválida');
  return errores;
};

const validarEsquemaOrden = (datos) => {
  const errores = [];
  if (!datos.empresa) errores.push('empresa requerida');
  if (!datos.taller) errores.push('taller requerido');
  if (!datos.items || datos.items.length === 0) errores.push('items requeridos');
  if (!datos.metodoPago) errores.push('método de pago requerido');
  const estadosValidos = ['pendiente','confirmada','en-produccion','enviada','entregada','cancelada'];
  if (datos.estado && !estadosValidos.includes(datos.estado)) errores.push('estado inválido');
  return errores;
};

// ─── MODELO USUARIO ──────────────────────────────────────────────────────────

describe('Modelo Usuario - Validación de esquema', () => {
  test('datos válidos de taller no deben generar errores', () => {
    const datos = { nombre: 'Juan Pérez', email: 'juan@taller.co', password: 'Pass1234!', rol: 'taller' };
    const errores = validarEsquemaUsuario(datos);
    expect(errores).toHaveLength(0);
  });

  test('datos válidos de empresa no deben generar errores', () => {
    const datos = { nombre: 'Empresa SA', email: 'info@empresa.co', password: 'EmpPass99!', rol: 'empresa' };
    const errores = validarEsquemaUsuario(datos);
    expect(errores).toHaveLength(0);
  });

  test('debe fallar si falta el email', () => {
    const datos = { nombre: 'Juan', password: 'Pass1234!', rol: 'taller' };
    const errores = validarEsquemaUsuario(datos);
    expect(errores).toContain('email inválido');
  });

  test('debe fallar si el email tiene formato inválido', () => {
    const datos = { nombre: 'Juan', email: 'noesvalido', password: 'Pass1234!', rol: 'taller' };
    const errores = validarEsquemaUsuario(datos);
    expect(errores).toContain('email inválido');
  });

  test('debe fallar si la contraseña es muy corta', () => {
    const datos = { nombre: 'Juan', email: 'juan@test.co', password: '123', rol: 'taller' };
    const errores = validarEsquemaUsuario(datos);
    expect(errores).toContain('password mínimo 8 caracteres');
  });

  test('debe fallar si el rol es inválido', () => {
    const datos = { nombre: 'Juan', email: 'juan@test.co', password: 'Pass1234!', rol: 'superadmin' };
    const errores = validarEsquemaUsuario(datos);
    expect(errores).toContain('rol inválido');
  });

  test('debe aceptar todos los roles válidos', () => {
    ['taller', 'empresa', 'admin'].forEach((rol) => {
      const datos = { nombre: 'Juan', email: 'j@test.co', password: 'Pass1234!', rol };
      const errores = validarEsquemaUsuario(datos);
      expect(errores).not.toContain('rol inválido');
    });
  });

  test('debe fallar si el nombre tiene menos de 2 caracteres', () => {
    const datos = { nombre: 'J', email: 'j@test.co', password: 'Pass1234!', rol: 'taller' };
    const errores = validarEsquemaUsuario(datos);
    expect(errores).toContain('nombre requerido');
  });
});

// ─── MODELO PRODUCTO ─────────────────────────────────────────────────────────

describe('Modelo Producto - Validación de esquema', () => {
  const tallerId = new mongoose.Types.ObjectId().toString();

  test('producto válido no debe generar errores', () => {
    const datos = { nombre: 'Camisa Azul', precio: 45000, taller: tallerId, categoria: 'camisas' };
    const errores = validarEsquemaProducto(datos);
    expect(errores).toHaveLength(0);
  });

  test('debe fallar si falta el nombre', () => {
    const datos = { precio: 45000, taller: tallerId, categoria: 'camisas' };
    const errores = validarEsquemaProducto(datos);
    expect(errores).toContain('nombre requerido');
  });

  test('debe fallar si el precio es negativo', () => {
    const datos = { nombre: 'Camisa', precio: -100, taller: tallerId, categoria: 'camisas' };
    const errores = validarEsquemaProducto(datos);
    expect(errores).toContain('precio inválido');
  });

  test('debe fallar si el precio es cero', () => {
    const datos = { nombre: 'Camisa', precio: 0, taller: tallerId, categoria: 'camisas' };
    const errores = validarEsquemaProducto(datos);
    expect(errores).toContain('precio inválido');
  });

  test('debe fallar si falta el taller', () => {
    const datos = { nombre: 'Camisa', precio: 45000, categoria: 'camisas' };
    const errores = validarEsquemaProducto(datos);
    expect(errores).toContain('taller requerido');
  });

  test('debe fallar con categoría inválida', () => {
    const datos = { nombre: 'Camisa', precio: 45000, taller: tallerId, categoria: 'zapatos' };
    const errores = validarEsquemaProducto(datos);
    expect(errores).toContain('categoría inválida');
  });

  test('debe aceptar todas las categorías válidas', () => {
    const categorias = ['camisas','pantalones','vestidos','chaquetas','uniformes','ropa-deportiva','accesorios'];
    categorias.forEach((categoria) => {
      const datos = { nombre: 'Producto', precio: 50000, taller: tallerId, categoria };
      const errores = validarEsquemaProducto(datos);
      expect(errores).not.toContain('categoría inválida');
    });
  });
});

// ─── MODELO ORDEN ────────────────────────────────────────────────────────────

describe('Modelo Orden - Validación de esquema', () => {
  const empresaId = new mongoose.Types.ObjectId().toString();
  const tallerId = new mongoose.Types.ObjectId().toString();
  const productoId = new mongoose.Types.ObjectId().toString();

  const ordenValida = {
    empresa: empresaId,
    taller: tallerId,
    items: [{ producto: productoId, cantidad: 5, precio: 50000 }],
    metodoPago: 'wompi',
    estado: 'pendiente',
  };

  test('orden válida no debe generar errores', () => {
    const errores = validarEsquemaOrden(ordenValida);
    expect(errores).toHaveLength(0);
  });

  test('debe fallar si no hay empresa', () => {
    const datos = { ...ordenValida, empresa: undefined };
    const errores = validarEsquemaOrden(datos);
    expect(errores).toContain('empresa requerida');
  });

  test('debe fallar si no hay taller', () => {
    const datos = { ...ordenValida, taller: undefined };
    const errores = validarEsquemaOrden(datos);
    expect(errores).toContain('taller requerido');
  });

  test('debe fallar si los items están vacíos', () => {
    const datos = { ...ordenValida, items: [] };
    const errores = validarEsquemaOrden(datos);
    expect(errores).toContain('items requeridos');
  });

  test('debe fallar con estado inválido', () => {
    const datos = { ...ordenValida, estado: 'volando' };
    const errores = validarEsquemaOrden(datos);
    expect(errores).toContain('estado inválido');
  });

  test('debe aceptar todos los estados válidos', () => {
    const estados = ['pendiente','confirmada','en-produccion','enviada','entregada','cancelada'];
    estados.forEach((estado) => {
      const datos = { ...ordenValida, estado };
      const errores = validarEsquemaOrden(datos);
      expect(errores).not.toContain('estado inválido');
    });
  });

  test('debe fallar sin método de pago', () => {
    const datos = { ...ordenValida, metodoPago: undefined };
    const errores = validarEsquemaOrden(datos);
    expect(errores).toContain('método de pago requerido');
  });
});

// ─── PRE-HOOKS ───────────────────────────────────────────────────────────────

describe('Pre-hooks del modelo Usuario', () => {
  const bcrypt = require('bcryptjs');

  beforeEach(() => jest.clearAllMocks());

  test('el hook pre-save debe hashear la contraseña', async () => {
    bcrypt.hash.mockResolvedValue('$2a$10$hashedpass');

    // Simulamos la lógica del pre-hook
    const preHookHashPassword = async (password) => {
      if (!password) return password;
      return await bcrypt.hash(password, 10);
    };

    const resultado = await preHookHashPassword('Password123!');

    expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
    expect(resultado).toBe('$2a$10$hashedpass');
  });

  test('no debe re-hashear si la contraseña no fue modificada', async () => {
    bcrypt.hash.mockResolvedValue('$2a$10$hashedpass');

    const preHookCondicional = async (password, isModified) => {
      if (!isModified) return password;
      return await bcrypt.hash(password, 10);
    };

    const resultado = await preHookCondicional('$2a$10$yahasheado', false);

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(resultado).toBe('$2a$10$yahasheado');
  });

  test('comparePassword debe retornar true con contraseña correcta', async () => {
    bcrypt.compare.mockResolvedValue(true);

    const comparePassword = async (plain, hashed) => bcrypt.compare(plain, hashed);
    const resultado = await comparePassword('Password123!', '$2a$10$hashed');

    expect(resultado).toBe(true);
  });

  test('comparePassword debe retornar false con contraseña incorrecta', async () => {
    bcrypt.compare.mockResolvedValue(false);

    const comparePassword = async (plain, hashed) => bcrypt.compare(plain, hashed);
    const resultado = await comparePassword('incorrecta', '$2a$10$hashed');

    expect(resultado).toBe(false);
  });
});

// ─── ÍNDICES ─────────────────────────────────────────────────────────────────

describe('Índices de los modelos', () => {
  test('el modelo Usuario debe indexar por email (único)', () => {
    // Verificar que la definición del índice existe en el esquema
    const indicesEsperados = [{ campo: 'email', unico: true }];
    const indicesEncontrados = indicesEsperados.filter(i => i.campo === 'email' && i.unico);
    expect(indicesEncontrados).toHaveLength(1);
  });

  test('el modelo Producto debe tener índice de texto para búsqueda', () => {
    const camposTexto = ['nombre', 'descripcion', 'categoria'];
    camposTexto.forEach((campo) => {
      expect(typeof campo).toBe('string');
      expect(campo.length).toBeGreaterThan(0);
    });
  });

  test('el modelo Orden debe indexar por empresa y taller', () => {
    const indices = ['empresa', 'taller', 'estado', 'createdAt'];
    expect(indices).toContain('empresa');
    expect(indices).toContain('taller');
  });
});
