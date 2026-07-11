// scripts/scaling/load-test.js
// ConnectModa — Script de prueba de carga con k6
// Uso: k6 run load-test.js
// Con variables: k6 run --env BASE_URL=https://connectmoda.co load-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ─── Métricas personalizadas ──────────────────────────────────────────────────
const loginDuration    = new Trend('login_duration', true);
const productDuration  = new Trend('product_list_duration', true);
const orderDuration    = new Trend('order_creation_duration', true);
const errorRate        = new Rate('error_rate');
const ordersCreated    = new Counter('orders_created');

// ─── Configuración del escenario ──────────────────────────────────────────────
export const options = {
  scenarios: {
    // Rampa de carga gradual
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 50   },   // Subir a 50 usuarios en 2min
        { duration: '5m',  target: 50   },   // Sostener 50 usuarios por 5min
        { duration: '2m',  target: 200  },   // Subir a 200 usuarios
        { duration: '5m',  target: 200  },   // Sostener 200 usuarios por 5min
        { duration: '2m',  target: 500  },   // Pico: 500 usuarios
        { duration: '3m',  target: 500  },   // Sostener el pico
        { duration: '2m',  target: 0    },   // Bajar gradualmente
      ],
    },
  },

  // Umbrales que deben cumplirse (SI FALLAN → el test falla con exit code 1)
  thresholds: {
    // SLO: p95 < 500ms
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    // SLO: tasa de errores < 1%
    error_rate: ['rate<0.01'],
    // Login debe ser rápido
    login_duration: ['p(95)<300'],
    // Lista de productos cacheada
    product_list_duration: ['p(95)<200'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// Datos de prueba
const testUsers = [
  { email: 'empresa1@loadtest.co', password: 'LoadTest123!' },
  { email: 'empresa2@loadtest.co', password: 'LoadTest123!' },
  { email: 'empresa3@loadtest.co', password: 'LoadTest123!' },
];

// ─── Setup: crear usuarios de prueba ─────────────────────────────────────────
export function setup() {
  // Registrar usuarios de prueba si no existen
  testUsers.forEach((user) => {
    http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
      ...user,
      nombre: 'Load Test User',
      rol: 'empresa',
    }), { headers: { 'Content-Type': 'application/json' } });
  });

  return { baseUrl: BASE_URL };
}

// ─── Flujo principal ──────────────────────────────────────────────────────────
export default function (data) {
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  let token = null;

  // ── Grupo 1: Autenticación ──────────────────────────────────────────────
  group('1. Login', () => {
    const start = Date.now();
    const res = http.post(
      `${data.baseUrl}/api/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    loginDuration.add(Date.now() - start);

    const ok = check(res, {
      'login status 200': (r) => r.status === 200,
      'login tiene token': (r) => JSON.parse(r.body)?.token !== undefined,
    });

    errorRate.add(!ok);

    if (res.status === 200) {
      token = JSON.parse(res.body).token;
    }
  });

  sleep(0.5);

  if (!token) return; // Si el login falló, no continuar

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // ── Grupo 2: Navegar catálogo ────────────────────────────────────────────
  group('2. Catálogo de productos', () => {
    const start = Date.now();

    // Lista general
    const listRes = http.get(`${data.baseUrl}/api/productos?pagina=1&limite=10`, { headers });
    productDuration.add(Date.now() - start);

    check(listRes, {
      'productos listados': (r) => r.status === 200,
      'respuesta tiene productos': (r) => {
        const body = JSON.parse(r.body);
        return body?.data?.productos !== undefined;
      },
    });
    errorRate.add(listRes.status !== 200);

    sleep(0.3);

    // Búsqueda con filtros
    const searchRes = http.get(
      `${data.baseUrl}/api/productos?categoria=camisas&precioMin=10000&precioMax=100000`,
      { headers }
    );
    check(searchRes, { 'búsqueda funciona': (r) => r.status === 200 });

    sleep(0.5);
  });

  // ── Grupo 3: Perfil ──────────────────────────────────────────────────────
  group('3. Perfil de usuario', () => {
    const res = http.get(`${data.baseUrl}/api/auth/perfil`, { headers });
    check(res, { 'perfil accesible': (r) => r.status === 200 });
  });

  sleep(1);

  // ── Grupo 4: Health check ────────────────────────────────────────────────
  group('4. Health check', () => {
    const res = http.get(`${data.baseUrl}/api/health`);
    check(res, {
      'health ok': (r) => r.status === 200,
      'bd conectada': (r) => JSON.parse(r.body)?.services?.database?.healthy === true,
    });
  });

  sleep(Math.random() * 2 + 1); // Pausa aleatoria entre 1-3 segundos
}

// ─── Teardown: reporte final ──────────────────────────────────────────────────
export function teardown(data) {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   ConnectModa — Prueba de Carga Completa ║
  ╠══════════════════════════════════════════╣
  ║  Ver resultados completos en la terminal  ║
  ║  Umbrales definidos en options.thresholds ║
  ╚══════════════════════════════════════════╝
  `);
}
