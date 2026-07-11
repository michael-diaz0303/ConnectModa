# docker/Dockerfile
# Multi-stage build para ConnectModa — imagen final mínima (~150MB)

# ─── STAGE 1: dependencias de desarrollo (build) ─────────────────────────────
FROM node:20-alpine AS builder

# Argumentos de build
ARG NODE_ENV=production
ARG APP_VERSION=1.0.0
ARG BUILD_DATE
ARG GIT_SHA

WORKDIR /app

# Copiar solo manifiestos primero (cache layer)
COPY package*.json ./

# Instalar TODAS las dependencias (incluye devDeps para posibles builds)
RUN npm ci --include=dev && npm cache clean --force

# Copiar código fuente
COPY src/ ./src/
COPY .eslintrc.json .prettierrc ./

# ─── STAGE 2: producción mínima ───────────────────────────────────────────────
FROM node:20-alpine AS production

# Metadatos de la imagen
LABEL org.opencontainers.image.title="ConnectModa Backend"
LABEL org.opencontainers.image.description="API REST para plataforma ConnectModa"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

# Variables de entorno
ENV NODE_ENV=production \
    PORT=5000 \
    APP_VERSION=${APP_VERSION}

# Herramientas mínimas de seguridad
RUN apk add --no-cache \
    curl \
    dumb-init \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Crear usuario sin privilegios (seguridad)
RUN addgroup -g 1001 -S connectmoda \
    && adduser -u 1001 -S connectmoda -G connectmoda

# Copiar solo dependencias de producción desde builder
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar código fuente
COPY --from=builder /app/src ./src/

# Crear directorio de logs con permisos correctos
RUN mkdir -p logs uploads && chown -R connectmoda:connectmoda /app

# Cambiar a usuario sin privilegios
USER connectmoda

# Puerto expuesto
EXPOSE 5000

# Health check integrado
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Usar dumb-init para manejo correcto de señales
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
