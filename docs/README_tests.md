# ConnectModa — Suite de Testing

Suite de tests automatizados para el backend de ConnectModa.

## Instalación

```bash
npm install
```

## Ejecutar Tests

```bash
# Todos los tests
npm test

# Solo unit tests
npm run test:unit

# Solo integration tests
npm run test:integration

# Solo E2E tests
npm run test:e2e

# Modo watch (re-corre al guardar)
npm run test:watch

# Con reporte de cobertura
npm run test:coverage
```

## Estructura

```
__tests__/
├── setup.js                    # Configuración global (mocks de Stripe, JWT, etc.)
├── fixtures/
│   └── index.js                # Fábricas de datos de prueba con @faker-js/faker
├── mocks/
│   ├── userModel.mock.js       # Mock del modelo Usuario
│   ├── productoModel.mock.js   # Mock del modelo Producto
│   └── ordenModel.mock.js      # Mock del modelo Orden
├── unit/
│   ├── controllers/
│   │   ├── authController.test.js      # Tests register/login/perfil
│   │   ├── ordenController.test.js     # Tests crear orden + Stripe
│   │   └── productoController.test.js  # Tests CRUD productos
│   ├── models/
│   │   └── models.test.js      # Tests de validación de esquemas y hooks
│   └── utils/
│       └── utils.test.js       # JWT, validators, paginar, calcular total
├── integration/
│   ├── routes/
│   │   ├── auth.routes.test.js         # POST /register, /login, GET /perfil
│   │   └── productos.routes.test.js    # CRUD completo de productos
│   └── services/
│       └── stripe.service.test.js      # Servicio de pagos con Stripe
└── e2e/
    └── flows/
        └── flujo-completo.test.js      # Flujos completos de principio a fin
```

## Cobertura mínima requerida

El CI falla si la cobertura está por debajo del **80%** en:
- Líneas
- Funciones
- Branches
- Statements

## CI/CD

Los tests corren automáticamente en GitHub Actions en cada:
- `push` a `main` o `develop`
- `pull_request` hacia `main` o `develop`

Ver `.github/workflows/tests.yml` para la configuración completa.

## Variables de entorno

Copiar `.env.test.example` como `.env.test` y completar con tus claves de test de Stripe.

> ⚠️ Nunca usar claves de producción en los tests.
