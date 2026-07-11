// __tests__/unit/utils/utils.test.js
// Tests de funciones utilitarias: JWT, validadores, helpers

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('token_test_123'),
  verify: jest.fn(),
  decode: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { mongoId } = require('../../fixtures');

// ─── Funciones utilitarias a testear (simuladas) ──────────────────────────────
// Estas funciones representan la lógica real en src/utils/

const generarToken = (payload, secreto = 'test_secret', opciones = { expiresIn: '7d' }) => {
  if (!payload || !payload.id) throw new Error('Payload inválido: se requiere id');
  return jwt.sign(payload, secreto, opciones);
};

const verificarToken = (token, secreto = 'test_secret') => {
  if (!token) throw new Error('Token requerido');
  return jwt.verify(token, secreto);
};

const validarEmail = (email) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

const validarPassword = (password) => {
  if (!password) return { valida: false, errores: ['contraseña requerida'] };
  const errores = [];
  if (password.length < 8) errores.push('mínimo 8 caracteres');
  if (!/[A-Z]/.test(password)) errores.push('debe tener al menos una mayúscula');
  if (!/[0-9]/.test(password)) errores.push('debe tener al menos un número');
  return { valida: errores.length === 0, errores };
};

const sanitizarTexto = (texto) => {
  if (!texto) return '';
  return texto.trim().replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
};

const calcularTotalOrden = (items) => {
  if (!items || items.length === 0) return 0;
  return items.reduce((total, item) => {
    if (!item.precio || !item.cantidad) return total;
    return total + item.precio * item.cantidad;
  }, 0);
};

const calcularDescuento = (total, porcentaje) => {
  if (!total || total <= 0) return 0;
  if (!porcentaje || porcentaje < 0 || porcentaje > 100) return total;
  return total - total * (porcentaje / 100);
};

const paginar = (pagina = 1, limite = 10) => {
  const paginaNum = Math.max(1, parseInt(pagina));
  const limiteNum = Math.min(100, Math.max(1, parseInt(limite)));
  return { skip: (paginaNum - 1) * limiteNum, limit: limiteNum };
};

const formatearPrecioCOP = (valor) => {
  if (typeof valor !== 'number') return '$ 0';
  return `$ ${valor.toLocaleString('es-CO')}`;
};

const esMongoId = (id) => /^[a-fA-F0-9]{24}$/.test(id);

// ─── JWT UTILS ────────────────────────────────────────────────────────────────

describe('Utils - generarToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('debe generar un token con payload válido', () => {
    const payload = { id: mongoId(), rol: 'taller' };
    const token = generarToken(payload);
    expect(jwt.sign).toHaveBeenCalledWith(payload, expect.any(String), expect.any(Object));
    expect(token).toBe('token_test_123');
  });

  test('debe lanzar error si el payload no tiene id', () => {
    expect(() => generarToken({ rol: 'taller' })).toThrow('Payload inválido');
  });

  test('debe lanzar error si el payload es nulo', () => {
    expect(() => generarToken(null)).toThrow();
  });

  test('debe aceptar opciones de expiración personalizadas', () => {
    const payload = { id: mongoId() };
    generarToken(payload, 'secreto', { expiresIn: '1h' });
    expect(jwt.sign).toHaveBeenCalledWith(payload, 'secreto', { expiresIn: '1h' });
  });
});

describe('Utils - verificarToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('debe verificar un token válido', () => {
    jwt.verify.mockReturnValue({ id: mongoId(), rol: 'taller' });
    const resultado = verificarToken('token_valido');
    expect(jwt.verify).toHaveBeenCalledWith('token_valido', expect.any(String));
    expect(resultado).toHaveProperty('id');
  });

  test('debe lanzar error si el token está expirado', () => {
    jwt.verify.mockImplementation(() => { throw new Error('jwt expired'); });
    expect(() => verificarToken('token_expirado')).toThrow('jwt expired');
  });

  test('debe lanzar error si el token es inválido', () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });
    expect(() => verificarToken('token_falso')).toThrow('invalid signature');
  });

  test('debe lanzar error si no se proporciona token', () => {
    expect(() => verificarToken(null)).toThrow('Token requerido');
  });

  test('debe lanzar error si el token es string vacío', () => {
    expect(() => verificarToken('')).toThrow('Token requerido');
  });
});

// ─── VALIDADORES ─────────────────────────────────────────────────────────────

describe('Utils - validarEmail', () => {
  test('debe aceptar emails válidos', () => {
    const emailsValidos = [
      'usuario@gmail.com',
      'taller@connectmoda.co',
      'empresa.sa@dominio.com.co',
      'info+test@empresa.net',
    ];
    emailsValidos.forEach((email) => {
      expect(validarEmail(email)).toBe(true);
    });
  });

  test('debe rechazar emails inválidos', () => {
    const emailsInvalidos = [
      'sinArroba',
      '@sinusuario.com',
      'sin.dominio@',
      '',
      null,
      undefined,
      '  espacios  ',
    ];
    emailsInvalidos.forEach((email) => {
      expect(validarEmail(email)).toBe(false);
    });
  });

  test('debe ignorar espacios en blanco alrededor', () => {
    expect(validarEmail('  user@test.com  ')).toBe(true);
  });
});

describe('Utils - validarPassword', () => {
  test('contraseña fuerte debe ser válida', () => {
    const resultado = validarPassword('Password123!');
    expect(resultado.valida).toBe(true);
    expect(resultado.errores).toHaveLength(0);
  });

  test('contraseña corta debe fallar', () => {
    const resultado = validarPassword('Pas1');
    expect(resultado.valida).toBe(false);
    expect(resultado.errores).toContain('mínimo 8 caracteres');
  });

  test('contraseña sin mayúsculas debe fallar', () => {
    const resultado = validarPassword('password123');
    expect(resultado.valida).toBe(false);
    expect(resultado.errores).toContain('debe tener al menos una mayúscula');
  });

  test('contraseña sin números debe fallar', () => {
    const resultado = validarPassword('PasswordSinNumeros');
    expect(resultado.valida).toBe(false);
    expect(resultado.errores).toContain('debe tener al menos un número');
  });

  test('contraseña nula debe retornar errores', () => {
    const resultado = validarPassword(null);
    expect(resultado.valida).toBe(false);
    expect(resultado.errores.length).toBeGreaterThan(0);
  });

  test('puede retornar múltiples errores', () => {
    const resultado = validarPassword('abc');
    expect(resultado.errores.length).toBeGreaterThan(1);
  });
});

// ─── SANITIZACIÓN ────────────────────────────────────────────────────────────

describe('Utils - sanitizarTexto', () => {
  test('debe eliminar etiquetas HTML', () => {
    expect(sanitizarTexto('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  test('debe eliminar etiquetas con atributos', () => {
    expect(sanitizarTexto('<img src="x" onerror="alert(1)">')).toBe('');
  });

  test('debe conservar texto normal', () => {
    expect(sanitizarTexto('Taller de costura Bogotá')).toBe('Taller de costura Bogotá');
  });

  test('debe recortar espacios', () => {
    expect(sanitizarTexto('  texto con espacios  ')).toBe('texto con espacios');
  });

  test('debe retornar string vacío para null/undefined', () => {
    expect(sanitizarTexto(null)).toBe('');
    expect(sanitizarTexto(undefined)).toBe('');
    expect(sanitizarTexto('')).toBe('');
  });
});

// ─── CÁLCULOS DE ORDEN ────────────────────────────────────────────────────────

describe('Utils - calcularTotalOrden', () => {
  test('debe calcular correctamente el total', () => {
    const items = [
      { producto: mongoId(), cantidad: 3, precio: 50000 },
      { producto: mongoId(), cantidad: 2, precio: 75000 },
    ];
    expect(calcularTotalOrden(items)).toBe(300000);
  });

  test('debe retornar 0 para lista vacía', () => {
    expect(calcularTotalOrden([])).toBe(0);
  });

  test('debe retornar 0 para null', () => {
    expect(calcularTotalOrden(null)).toBe(0);
  });

  test('debe ignorar items sin precio o cantidad', () => {
    const items = [
      { producto: mongoId(), cantidad: 2, precio: 50000 },
      { producto: mongoId() }, // sin precio ni cantidad
    ];
    expect(calcularTotalOrden(items)).toBe(100000);
  });

  test('debe manejar un solo item', () => {
    const items = [{ producto: mongoId(), cantidad: 10, precio: 20000 }];
    expect(calcularTotalOrden(items)).toBe(200000);
  });
});

describe('Utils - calcularDescuento', () => {
  test('debe aplicar descuento del 10%', () => {
    expect(calcularDescuento(100000, 10)).toBe(90000);
  });

  test('debe aplicar descuento del 50%', () => {
    expect(calcularDescuento(200000, 50)).toBe(100000);
  });

  test('debe retornar el total sin cambios si descuento es 0', () => {
    expect(calcularDescuento(100000, 0)).toBe(100000);
  });

  test('debe retornar 0 si el total es 0', () => {
    expect(calcularDescuento(0, 20)).toBe(0);
  });

  test('debe retornar total si porcentaje es inválido', () => {
    expect(calcularDescuento(100000, -10)).toBe(100000);
    expect(calcularDescuento(100000, 110)).toBe(100000);
  });
});

// ─── PAGINACIÓN ───────────────────────────────────────────────────────────────

describe('Utils - paginar', () => {
  test('debe calcular skip y limit correctamente', () => {
    expect(paginar(2, 10)).toEqual({ skip: 10, limit: 10 });
  });

  test('página 1 debe tener skip 0', () => {
    expect(paginar(1, 10)).toEqual({ skip: 0, limit: 10 });
  });

  test('debe usar valores por defecto', () => {
    expect(paginar()).toEqual({ skip: 0, limit: 10 });
  });

  test('no debe permitir límites mayores a 100', () => {
    const resultado = paginar(1, 500);
    expect(resultado.limit).toBe(100);
  });

  test('no debe permitir páginas menores a 1', () => {
    const resultado = paginar(-5, 10);
    expect(resultado.skip).toBe(0);
  });

  test('debe manejar valores string (query params)', () => {
    const resultado = paginar('3', '20');
    expect(resultado).toEqual({ skip: 40, limit: 20 });
  });
});

// ─── FORMATO MONEDA ───────────────────────────────────────────────────────────

describe('Utils - formatearPrecioCOP', () => {
  test('debe formatear precios en pesos colombianos', () => {
    const resultado = formatearPrecioCOP(150000);
    expect(resultado).toContain('150');
    expect(resultado).toContain('$');
  });

  test('debe manejar cero', () => {
    expect(formatearPrecioCOP(0)).toContain('0');
  });

  test('debe manejar valores no numéricos', () => {
    expect(formatearPrecioCOP('texto')).toBe('$ 0');
    expect(formatearPrecioCOP(null)).toBe('$ 0');
  });
});

// ─── VALIDACIÓN DE MONGO IDs ──────────────────────────────────────────────────

describe('Utils - esMongoId', () => {
  test('debe aceptar ObjectIds válidos', () => {
    expect(esMongoId('507f1f77bcf86cd799439011')).toBe(true);
    expect(esMongoId('64abcdef1234567890abcdef')).toBe(true);
  });

  test('debe rechazar IDs inválidos', () => {
    expect(esMongoId('no-es-un-id')).toBe(false);
    expect(esMongoId('123')).toBe(false);
    expect(esMongoId('')).toBe(false);
    expect(esMongoId('507f1f77bcf86cd79943901Z')).toBe(false); // letra Z inválida
  });
});
