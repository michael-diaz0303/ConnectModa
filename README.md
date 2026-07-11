# ConnectModa

ConnectModa es una plataforma para conectar talleres de confección con empresas y compradores. Este repositorio contiene el frontend estático (HTML/CSS/JS) y un backend en Node.js (Express + Mongoose) con soporte para colas (Bull/RabbitMQ), websockets (Socket.io) y procesamiento en background (worker).

Resumen rápido
- Frontend: carpeta `frontend/` (index.html, dashboard.html, JS/CSS estático)
- Backend: carpeta `backend/` (Express app, worker, controllers, models, servicios)
- Infra / Dev: `infra/` (docker / compose), `INSTALLATION.md` con instrucciones de desarrollo

Rápida puesta en marcha (desarrollo)
1. Copia variables de entorno y edítalas:

```bash
cp .env.example .env
# editar .env (MONGO_URI, JWT_SECRET, REDIS_URL, etc.)
```

2. Levantar servicios de desarrollo (opcional con docker-compose):

```bash
# desde la raíz
docker-compose -f infra/docker-compose.yml up -d
```

3. Instalar dependencias y arrancar backend en desarrollo:

```bash
cd backend
npm install
npm run dev
```

4. Servir frontend (local):

```bash
npx serve frontend
# o
python -m http.server 8000 --directory frontend
```

Tests y lint (backend)

```bash
cd backend
npm run lint
npm test
```

Archivos importantes
- `backend/server.js` — entrada HTTP, Socket.io y arranque de colas
- `backend/worker.js` — proceso worker que consume colas
- `.env.example` — plantilla de variables de entorno
- `backend/package.json` — scripts y dependencias del backend
- `INSTALLATION.md` — instrucciones de instalación y despliegue

Contribuir
- Crea PRs pequeños y descriptivos.
- Añade tests cuando cambies lógica en `services/` o `controllers/`.

Licencia
- Añade una licencia si vas a publicar el proyecto (ej. MIT). Actualmente no está incluida.
