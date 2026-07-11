# INSTALLATION & DEPLOY (Desarrollo)

Este documento explica cómo dejar el proyecto ConnectModa listo para desarrollo y pruebas locales. Está escrito en español y complementa `.env.example` y `backend/package.json`.

Requisitos
- Node.js >= 18
- npm (o yarn)
- MongoDB (local o en la nube)
- Redis (si vas a usar colas Bull)
- Git

Preparar variables de entorno
1. Copia el fichero de ejemplo:

```bash
cp .env.example .env
```

2. Rellena las variables necesarias en `.env`. Las más importantes son:
- MONGO_URI: cadena de conexión a MongoDB.
- JWT_SECRET: secreto para tokens JWT (usar valor largo y seguro).
- REDIS_URL / BULL_REDIS_URL: conexión a Redis si `QUEUE_ENABLED=true`.
- QUEUE_ENABLED: `true` para usar Redis/Bull, `false` para ejecutar jobs inline.
- STORAGE_PROVIDER: `local`, `s3` o `cloudinary`.
- AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_BUCKET_NAME (si usas S3).
- CLOUDINARY_* (si usas Cloudinary).
- SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS (para envío de emails).
- IA_PROVIDER y claves (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) si usas funciones de IA.
- SENTRY_DSN (opcional) si activas Sentry.

Arrancar el backend (desarrollo)

```bash
cd backend
npm install
# en desarrollo con recarga automática:
npm run dev
# en producción:
npm start
```

El servidor por defecto usa PORT=3000 (configurable desde .env). `server.js` es la entrada principal.

Ejecutar el worker de colas (Bull)

Si usas colas (QUEUE_ENABLED=true) y tienes Redis configurado:

```bash
cd backend
# ejecuta el proceso worker que procesa trabajos en segundo plano
npm run worker
```

Frontend (local)

El frontend incluído es estático (HTML/CSS/JS) en la carpeta `frontend/`.
Puedes abrir `frontend/index.html` directamente o servir la carpeta con un servidor estático:

```bash
# desde la raíz del repo
npx serve frontend
# o con Python
python -m http.server 8000 --directory frontend
```

Asegúrate de que en `.env` la variable `FRONTEND_URL` apunte al origen correcto para CORS.

Tests y lint

```bash
cd backend
npm install
npm run lint
npm test
```

(Si `npm test` no encuentra tests, crea pruebas en `backend/tests` o revisa la configuración de Jest en `package.json`.)

Docker / Desarrollo con contenedores

Revisa la carpeta `infra/` antes de crear tu propia configuración; puede contener docker-compose o plantillas.
A continuación un `docker-compose` mínimo para desarrollo (Mongo + Redis) — ajusta versiones y redes según necesites:

```yaml
version: '3.8'
services:
  mongo:
    image: mongo:6
    restart: unless-stopped
    ports:
      - 27017:27017
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7
    restart: unless-stopped
    ports:
      - 6379:6379

volumes:
  mongo-data:
```

Si deseas Dockerizar backend/frontend, añade Dockerfile y define servicios `backend` y `frontend` en `docker-compose`, y asegúrate de que el backend lea variables desde un archivo `.env`.

Buenas prácticas y comprobaciones rápidas
- No subas archivos con secretos (`.env`) al repositorio.
- Revisa `backend/server.js` y `backend/worker.js` para asegurar manejo de SIGTERM y reconexiones a Mongo/Redis.
- Mueve lógica compleja fuera de controllers/ y hacia services/ para facilitar tests.
- Añade GitHub Actions (o similar) que ejecuten lint y tests en cada PR.
- Comprueba que `QUEUE_ENABLED=false` funciona para entornos sin Redis (está documentado en package.json notes).

¿Siguiente paso?
Puedo:
- Generar un `README.md` con estas instrucciones y secciones adicionales (deploy, infra) y crear el archivo en el repo.
- Revisar `server.js` y `worker.js` para recomendar mejoras concretas en manejo de errores.
- Crear un `docker-compose.yml` completo para desarrollo dentro de `infra/`.

Indica cuál prefieres y lo hago: ya preparé este documento listo para añadir al repositorio si confirmas.