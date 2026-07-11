# 🚀 PLAN BACKEND CONNECTMODA CON IA
## Ordenado por dificultad y tokens requeridos

---

## 📊 DIAGRAMA DE PROCESOS POR NIVEL

```
FÁCIL (100-300 tokens)
├─ P1: Setup Express + MongoDB
├─ P2: Modelos de datos
├─ P3: CRUD básico productos
└─ P4: Validaciones

MEDIO (300-600 tokens)
├─ P5: Autenticación JWT
├─ P6: Roles y permisos
├─ P7: Carrito de compras
└─ P8: Búsqueda productos

DIFÍCIL (600-1000 tokens)
├─ P9: Sistema de órdenes
├─ P10: Integración Stripe
├─ P11: WebSockets notificaciones
└─ P12: Cache Redis

MUY DIFÍCIL (1000-1500 tokens)
├─ P13: Sistema de recomendaciones con IA
├─ P14: Colas de trabajo (Bull)
├─ P15: Subida de imágenes a S3
└─ P16: Analytics y reportes

EXPERTO (1500+ tokens)
├─ P17: Microservicios
├─ P18: Testing automatizado
├─ P19: CI/CD completo
└─ P20: Escalabilidad horizontal
```

---

# 🟢 NIVEL FÁCIL (100-300 tokens c/u)

## P1: SETUP EXPRESS + MONGODB
**Tokens:** 150  
**Tiempo:** 10 minutos  
**Para qué:** Base del servidor y conexión a BD

```
PROMPT PARA CLAUDE:

"Crea un servidor Express.js escalable para ConnectModa con:

1. Estructura de carpetas:
   src/
   ├── server.js (entrada)
   ├── config/
   │   └── database.js (conexión MongoDB)
   ├── routes/
   ├── controllers/
   ├── models/
   ├── middleware/
   └── utils/

2. package.json con:
   - express, mongoose, dotenv, cors, helmet, morgan

3. Archivo config/database.js:
   - Conexión a MongoDB con manejo de errores
   - Reconexión automática
   - Logs de conexión

4. server.js con:
   - Puerto configurable desde .env
   - CORS habilitado
   - Helmet para seguridad
   - Morgan para logs
   - Manejo de errores global

5. .env.example con variables

El código debe estar LISTO para producción"
```

---

## P2: MODELOS DE DATOS
**Tokens:** 200  
**Tiempo:** 15 minutos  
**Para qué:** Estructura de usuarios, productos, órdenes

```
PROMPT PARA CLAUDE:

"Crea los modelos de Mongoose para ConnectModa:

1. Modelo Usuario:
   - email, contraseña (hash), nombre, apellido
   - teléfono, ubicación, ciudad
   - rol (emprendedor/comprador/admin)
   - foto de perfil (URL)
   - descripción del taller/negocio
   - estado (activo/inactivo)
   - verificado (true/false)
   - timestamps (createdAt, updatedAt)
   - Índices: email único, estado

2. Modelo Producto:
   - nombre, descripción, precio
   - categoría (vestido, accesorios, calzado, etc)
   - tallas disponibles (array)
   - colores disponibles (array)
   - imágenes (URLs array)
   - stock, vendidos
   - propietario (referencia a Usuario)
   - rating y reviews
   - timestamps
   - Índices: propietario, categoría, nombre

3. Modelo Carrito:
   - usuario (referencia)
   - productos (array con cantidad)
   - total calculado
   - timestamps

4. Modelo Orden:
   - usuario (referencia)
   - productos (array con cantidad y precio)
   - total, impuestos, envío
   - estado (pendiente/pagado/enviado/entregado)
   - dirección de envío
   - método de pago
   - timestamps

Incluye: validaciones, métodos útiles, pre-hooks"
```

---

## P3: CRUD BÁSICO PRODUCTOS
**Tokens:** 180  
**Tiempo:** 12 minutos  
**Para qué:** Crear, leer, actualizar, eliminar productos

```
PROMPT PARA CLAUDE:

"Crea los controllers y routes CRUD para productos:

1. ProductController con métodos:
   - createProduct (POST)
     * Validar datos
     * Verificar usuario autenticado
     * Crear producto con propietario
     * Retornar producto creado

   - getProducts (GET)
     * Listar todos los productos
     * Filtrar por categoría (query param)
     * Paginación (10 por página)
     * Retornar array de productos

   - getProductById (GET/:id)
     * Obtener producto por ID
     * Incluir datos del propietario
     * Retornar 404 si no existe

   - updateProduct (PUT/:id)
     * Validar que pertenece al usuario
     * Actualizar solo campos permitidos
     * Retornar producto actualizado

   - deleteProduct (DELETE/:id)
     * Validar que pertenece al usuario
     * Eliminar de BD
     * Retornar confirmación

2. Routes en routes/productos.js:
   - POST /api/productos
   - GET /api/productos
   - GET /api/productos/:id
   - PUT /api/productos/:id
   - DELETE /api/productos/:id

3. Middleware de autenticación básico (sin JWT aún):
   - Verificar usuario existe
   - Pasar usuario al controller

Incluye: manejo de errores, validaciones, logs"
```

---

## P4: VALIDACIONES Y SANITIZACIÓN
**Tokens:** 120  
**Tiempo:** 10 minutos  
**Para qué:** Proteger datos y verificar entrada correcta

```
PROMPT PARA CLAUDE:

"Crea middleware de validaciones para ConnectModa:

1. Validadores en utils/validators.js:
   - validateEmail (formato email)
   - validatePassword (mín 8 caracteres, mayúscula, número)
   - validateProducto (campos requeridos)
   - validateOrden (dirección, método pago)
   - validatePhoneNumber (formato teléfono)

2. Sanitizadores en utils/sanitizers.js:
   - sanitizeString (trim, lowercase si aplica)
   - sanitizeEmail (lowercase)
   - sanitizeNumber (convertir a número)
   - sanitizeURL (validar URL válida)

3. Middleware de validación en middleware/validation.js:
   - validateCreateProduct (body)
   - validateCreateUser (body)
   - validateCreateOrder (body)

4. Manejo de errores:
   - Retornar mensajes claros
   - Códigos HTTP correctos (400, 422)
   - No exponer detalles de sistema

Usa: express-validator o similar

Incluye: ejemplos de uso en comentarios"
```

---

# 🟡 NIVEL MEDIO (300-600 tokens c/u)

## P5: AUTENTICACIÓN JWT
**Tokens:** 400  
**Tiempo:** 20 minutos  
**Para qué:** Login seguro, proteger rutas privadas

```
PROMPT PARA CLAUDE:

"Crea sistema de autenticación JWT para ConnectModa:

1. utils/jwt.js:
   - generateToken (usuario, expiración 7 días)
   - verifyToken (token)
   - refreshToken (generar nuevo token)
   - decodeToken (sin verificar - solo leer)

2. controllers/authController.js:
   - register (POST)
     * Validar email no exista
     * Hash contraseña con bcrypt
     * Crear usuario
     * Generar JWT
     * Retornar token y usuario

   - login (POST)
     * Validar email existe
     * Comparar contraseña con bcrypt
     * Generar JWT
     * Retornar token

   - logout (POST)
     * Opcional: agregar token a blacklist

   - refreshToken (POST)
     * Validar refresh token
     * Generar nuevo access token
     * Retornar token

3. middleware/auth.js:
   - authenticateToken
     * Obtener token del header Authorization
     * Verificar token válido
     * Pasar usuario al siguiente middleware
     * Retornar 401 si falla

4. routes/auth.js:
   - POST /api/auth/register
   - POST /api/auth/login
   - POST /api/auth/refresh
   - POST /api/auth/logout (opcional)

5. Configuración:
   - JWT_SECRET en .env
   - JWT_EXPIRATION
   - REFRESH_TOKEN_EXPIRATION

Incluye: validaciones, manejo de errores, seguridad"
```

---

## P6: ROLES Y PERMISOS
**Tokens:** 350  
**Tiempo:** 15 minutos  
**Para qué:** Controlar qué puede hacer cada usuario

```
PROMPT PARA CLAUDE:

"Crea sistema de roles y permisos para ConnectModa:

1. Roles permitidos en enum:
   - EMPRENDEDOR (puede vender productos)
   - COMPRADOR (puede comprar)
   - ADMIN (acceso total)
   - MODERADOR (revisar productos)

2. Permisos asociados:
   - EMPRENDEDOR: crear/editar/borrar sus productos, ver sus ventas
   - COMPRADOR: comprar, ver historial órdenes, dejar reviews
   - ADMIN: todo
   - MODERADOR: revisar/aprobar productos

3. middleware/authorization.js:
   - checkRole (rolesPermitidos) middleware
     * Verificar usuario autenticado
     * Verificar rol en array permitido
     * Retornar 403 si no tiene permisos

   - checkResourceOwner (verificar es dueño del recurso)
     * Para editar/borrar propios recursos

   - checkPermission (permiso específico) middleware

4. Ejemplo de uso en routes:
   - POST /api/productos (solo EMPRENDEDOR)
   - POST /api/ordenes (solo COMPRADOR)
   - POST /api/admin/usuarios (solo ADMIN)
   - PUT /api/productos/:id (solo EMPRENDEDOR propietario)

5. Tabla de permisos en utils/permissions.js

Incluye: logs de acceso denegado, tipos de permisos expandibles"
```

---

## P7: CARRITO DE COMPRAS
**Tokens:** 450  
**Tiempo:** 18 minutos  
**Para qué:** Guardar productos antes de comprar

```
PROMPT PARA CLAUDE:

"Crea sistema de carrito de compras para ConnectModa:

1. Model Carrito (Mongoose):
   - usuario (referencia)
   - items: array de {
       producto (referencia),
       cantidad,
       talla,
       color,
       precioUnitario
     }
   - total (calculado automático)
   - timestamps

2. controllers/carritoController.js:
   - getCarrito (GET)
     * Obtener carrito del usuario actual
     * Incluir detalles de productos
     * Retornar items y total

   - addToCart (POST)
     * Parámetros: productoId, cantidad, talla, color
     * Validar producto existe
     * Si existe en carrito: sumar cantidad
     * Si no existe: agregar item
     * Recalcular total
     * Retornar carrito actualizado

   - updateCartItem (PUT/:productoId)
     * Parámetros: cantidad, talla, color
     * Validar cantidad > 0
     * Actualizar item
     * Recalcular total
     * Retornar carrito

   - removeFromCart (DELETE/:productoId)
     * Eliminar producto del carrito
     * Recalcular total
     * Retornar carrito

   - clearCart (DELETE)
     * Vaciar todo el carrito
     * Retornar confirmación

3. routes/carrito.js:
   - GET /api/carrito
   - POST /api/carrito
   - PUT /api/carrito/:productoId
   - DELETE /api/carrito/:productoId
   - DELETE /api/carrito (limpiar)

4. Lógica:
   - Validar stock disponible
   - Recalcular totales con cada cambio
   - Timestamps de última actualización
   - Expiración automática (90 días sin usar)

Incluye: validaciones, cálculo automático totales"
```

---

## P8: BÚSQUEDA AVANZADA
**Tokens:** 380  
**Tiempo:** 16 minutos  
**Para qué:** Encontrar productos por filtros

```
PROMPT PARA CLAUDE:

"Crea sistema de búsqueda avanzada para ConnectModa:

1. controllers/searchController.js:
   - searchProductos (GET)
     * Query params:
       - q: texto a buscar (nombre, descripción)
       - categoría: filtrar por categoría
       - precioMin: precio mínimo
       - precioMax: precio máximo
       - ciudad: ubicación del vendedor
       - talla: filtrar por talla disponible
       - rating: rating mínimo
       - ordenar: (popular, precioAsc, precioDesc, nuevo)
       - página: paginación
       - limite: items por página

   - Lógica:
     * Construir query dinámico de MongoDB
     * Búsqueda de texto: nombre y descripción
     * Filtros numéricos: precio, rating
     * Filtros de array: tallas, colores
     * Ordenamiento: relevancia, precio, fecha
     * Paginación: saltar y limitar
     * Contar total de resultados

2. Modelo de respuesta:
   {
     resultados: [],
     total: número,
     página: número,
     páginas: número,
     perPágina: número
   }

3. Índices en MongoDB:
   - Texto en nombre y descripción
   - Índice en precio
   - Índice en categoría
   - Índice en ciudad

4. routes/search.js:
   - GET /api/buscar

5. Ejemplos:
   - /api/buscar?q=vestido&precioMax=100000
   - /api/buscar?categoría=accesorios&ciudad=Bogotá
   - /api/buscar?ordenar=precioAsc&página=2

Incluye: sanitización de búsqueda, prevención SQL injection"
```

---

# 🔴 NIVEL DIFÍCIL (600-1000 tokens c/u)

## P9: SISTEMA DE ÓRDENES
**Tokens:** 750  
**Tiempo:** 25 minutos  
**Para qué:** Procesar compras completas

```
PROMPT PARA CLAUDE:

"Crea sistema de órdenes para ConnectModa:

1. Model Orden (Mongoose):
   - usuario (referencia a Usuario)
   - items: array de {
       producto (referencia),
       cantidad,
       precioUnitario,
       subtotal
     }
   - total: { subtotal, impuestos, envío, total }
   - estado: enum (pendiente, procesando, pagado, enviado, entregado, cancelado)
   - metodo_pago: (tarjeta, transferencia, efectivo)
   - direccion_envio: { calle, número, ciudad, país, cp }
   - numero_seguimiento: string
   - fecha_estimada_entrega: date
   - notas: string
   - timestamps

2. controllers/ordenController.js:
   - crearOrden (POST)
     * Validar usuario
     * Obtener carrito del usuario
     * Validar carrito no vacío
     * Validar stock disponible
     * Calcular impuestos y envío
     * Crear orden
     * Vaciar carrito
     * Retornar orden creada

   - obtenerOrdenes (GET)
     * Listar órdenes del usuario actual
     * Paginación
     * Filtrar por estado (query param)
     * Retornar array de órdenes

   - obtenerOrdenPorId (GET/:id)
     * Validar pertenece a usuario
     * Incluir detalles de productos
     * Retornar orden completa

   - actualizarEstadoOrden (PATCH/:id)
     * Solo ADMIN/EMPRENDEDOR
     * Validar nuevo estado válido
     * Transición de estados correcta
     * Registrar cambios con timestamp
     * Retornar orden actualizada

   - cancelarOrden (POST/:id/cancelar)
     * Solo si estado es pendiente/procesando
     * Devolver stock a productos
     * Cambiar estado a cancelado
     * Retornar confirmación

3. routes/ordenes.js:
   - POST /api/ordenes
   - GET /api/ordenes
   - GET /api/ordenes/:id
   - PATCH /api/ordenes/:id (actualizar estado)
   - POST /api/ordenes/:id/cancelar

4. Lógica de negocio:
   - Transiciones de estado válidas
   - Calcular impuestos (19% IVA)
   - Calcular envío por ciudad
   - Reducir stock automático
   - Generar número de seguimiento
   - Registrar historial de cambios

Incluye: validaciones, transacciones, auditoría"
```

---

## P10: INTEGRACIÓN STRIPE (PAGOS)
**Tokens:** 850  
**Tiempo:** 30 minutos  
**Para qué:** Procesar pagos con tarjeta

```
PROMPT PARA CLAUDE:

"Crea integración de Stripe para ConnectModa:

1. Instalación:
   - npm install stripe

2. utils/stripe.js:
   - Inicializar cliente Stripe con API key
   - Configuración de moneda (COP)

3. controllers/pagoController.js:
   - crearIntentoPago (POST)
     * Obtener orden del usuario
     * Validar orden existe y está pendiente
     * Crear PaymentIntent en Stripe
     * Retornar clientSecret para frontend

   - confirmarPago (POST)
     * Recibir paymentIntentId del frontend
     * Verificar intento de pago en Stripe
     * Si status success:
       - Actualizar orden a 'pagado'
       - Reducir stock
       - Enviar email confirmación
       - Retornar confirmación
     * Si falló: retornar error

   - listarPagos (GET) - Admin
     * Listar todos los pagos
     * Filtrar por estado, fecha, usuario
     * Retornar array de pagos

   - obtenerRecibosPago (GET/:ordenId)
     * Generar recibo PDF
     * Retornar archivo

4. Webhook Stripe en routes/webhooks.js:
   - POST /api/webhooks/stripe
     * Endpoint público (sin autenticación)
     * Verificar firma de Stripe
     * Manejar eventos:
       - payment_intent.succeeded
       - payment_intent.payment_failed
       - charge.refunded
     * Actualizar órdenes en BD

5. Environment variables:
   - STRIPE_PUBLIC_KEY
   - STRIPE_SECRET_KEY
   - STRIPE_WEBHOOK_SECRET

6. Security:
   - Verificar firma de webhooks
   - Validar montos coincidan
   - Registrar transacciones
   - Manejo de reembolsos

Incluye: manejo de errores, logs, seguridad PCI"
```

---

## P11: WEBSOCKETS - NOTIFICACIONES EN TIEMPO REAL
**Tokens:** 900  
**Tiempo:** 28 minutos  
**Para qué:** Notificar cambios al usuario sin recargar

```
PROMPT PARA CLAUDE:

"Crea sistema de WebSockets para ConnectModa:

1. Instalación:
   - npm install socket.io

2. Configuración en server.js:
   - Integrar Socket.io con Express
   - CORS configurado
   - Namespace separados

3. utils/socketManager.js:
   - Manejar conexiones
   - Manejar desconexiones
   - Broadcasting de eventos
   - Salas (rooms) por usuario/tipo

4. Eventos a implementar:

   NOTIFICACIONES USUARIO:
   - order:created (nueva orden creada)
   - order:status_changed (orden cambió estado)
   - product:sold (producto vendido)
   - payment:confirmed (pago confirmado)
   - message:new (nuevo mensaje)

   CHAT EN VIVO:
   - chat:connect (conectar a sala)
   - chat:message (enviar mensaje)
   - chat:typing (usuario escribiendo)
   - chat:disconnect (desconectar)

   NOTIFICACIONES ADMIN:
   - product:pending_review (producto esperando revisión)
   - user:flagged (usuario reportado)
   - order:issue (problema con orden)

5. Estructura middleware/socketAuth.js:
   - Autenticar conexión
   - Verificar usuario
   - Agregar usuario al socket

6. Rutas de eventos en events/

7. Frontend (HTML):
   - Conectar Socket.io
   - Escuchar eventos
   - Mostrar notificaciones toasts
   - Actualizar UI sin recargar

8. Security:
   - Autenticación de conexión
   - Validar permisos de sala
   - Rate limiting de mensajes
   - Prevenir spam

Incluye: reconnect automático, manejo de errores"
```

---

## P12: CACHE CON REDIS
**Tokens:** 800  
**Tiempo:** 25 minutos  
**Para qué:** Acelerar búsquedas y reducir BD

```
PROMPT PARA CLAUDE:

"Crea sistema de caché Redis para ConnectModa:

1. Instalación:
   - npm install redis

2. utils/redis.js:
   - Conectar a Redis
   - Métodos: set, get, del, expire
   - Manejo de conexión
   - Logs de caché

3. Middleware de caché en middleware/cache.js:
   - cacheProductos (60 minutos)
   - cacheUsuario (30 minutos)
   - cacheBúsqueda (15 minutos)
   - Invalidar caché automático

4. Dónde aplicar caché:
   - GET /api/productos (listar todos)
   - GET /api/productos/:id (producto individual)
   - GET /api/buscar (búsquedas)
   - GET /api/categorías (listado de categorías)
   - GET /api/usuarios/:id (perfil usuario)

5. Lógica de caché:
   - Si existe en Redis: retornar
   - Si no existe: obtener de BD
   - Guardar en Redis con TTL
   - Retornar datos

6. Invalidación de caché:
   - Al crear producto: invalidar caché productos
   - Al actualizar producto: invalidar producto y búsquedas
   - Al borrar producto: invalidar todo relacionado
   - Pattern matching para borrar múltiples keys

7. Estructuras de caché:
   - products:list (array de productos)
   - product:{id} (producto individual)
   - search:{query} (resultados búsqueda)
   - user:{id} (perfil usuario)
   - categories (lista categorías)

8. Environment variables:
   - REDIS_URL o REDIS_HOST/PORT
   - CACHE_TTL

Incluye: manejo de errores, fallback a BD"
```

---

# 🟣 NIVEL MUY DIFÍCIL (1000-1500 tokens c/u)

## P13: RECOMENDACIONES CON IA
**Tokens:** 1200  
**Tiempo:** 35 minutos  
**Para qué:** Sugerir productos según preferencias

```
PROMPT PARA CLAUDE:

"Crea sistema de recomendaciones con IA para ConnectModa:

1. Opciones IA (elige una):
   a) OpenAI (GPT-4 mini) - $0.15 por 1M tokens
   b) Claude API - $0.30 por 1M tokens
   c) Google Gemini - Gratis hasta cierto límite
   d) Local: Ollama + Llama 2 (100% gratis)

2. Model RecomendacionIA (Mongoose):
   - usuario (referencia)
   - categorías_preferidas: array
   - precio_promedio: número
   - historial_búsquedas: array
   - productos_vistos: array
   - productos_comprados: array
   - rating_promedio_productos: número
   - última_actualización: date

3. controllers/iaController.js:
   - obtenerRecomendaciones (GET)
     * Analizar preferencias del usuario
     * Construir prompt para IA
     * Llamar a IA solicitando top 10 productos
     * Retornar IDs de productos recomendados

   - entenderPreferencias (POST)
     * Recibir descripción del usuario
     * Usar IA para categorizar preferencias
     * Actualizar modelo de usuario
     * Retornar resumen

   - chatConsultor (POST)
     * Chat con IA para asesoría
     * Usuario: 'Busco vestido negro para fiesta'
     * IA: 'Te recomiendo estos productos...'
     * Incluir links a productos
     * Guardar historial

4. Prompt para IA (ejemplo):
   
   'Analiza estos datos del usuario de ConnectModa:
   - Compras previas: [lista categorías]
   - Precio promedio: $150.000
   - Preferencias: [descripciones]
   
   Recomienda 10 productos de esta lista:
   [JSON con todos los productos]
   
   Retorna JSON con:
   {
     recomendaciones: [
       {id, motivo, puntaje_relevancia}
     ],
     resumen_preferencias: \"...\",
     consejos: \"...\"
   }'

5. utils/iaService.js:
   - Llamar API de IA elegida
   - Parsear respuesta JSON
   - Manejo de errores
   - Rate limiting

6. endpoints:
   - GET /api/ia/recomendaciones
   - POST /api/ia/entender-preferencias
   - POST /api/ia/consultor (chat)
   - GET /api/ia/consultor/historial

7. Caché de recomendaciones:
   - Guardar en Redis 24 horas
   - Invalidar si usuario compra algo

8. Environment variables:
   - IA_PROVIDER (openai/claude/gemini/ollama)
   - IA_API_KEY
   - IA_MODEL

Incluye: fallback a recomendaciones básicas, logs de uso IA"
```

---

## P14: COLAS DE TRABAJO (BULL/BEE-QUEUE)
**Tokens:** 1100  
**Tiempo:** 32 minutos  
**Para qué:** Procesar tareas pesadas sin bloquear servidor

```
PROMPT PARA CLAUDE:

"Crea sistema de colas para ConnectModa:

1. Instalación:
   - npm install bull redis

2. Crear colas en utils/queues.js:

   COLA: emailQueue
   - Tareas: enviar emails
   - Eventos: order:created, payment:confirmed, user:registered
   - Reintentos: 3
   - Delay: inmediato

   COLA: imageQueue
   - Tareas: procesar imágenes (redimensionar, optimizar)
   - Eventos: product:image_uploaded
   - Reintentos: 2
   - Delay: inmediato

   COLA: analyticsQueue
   - Tareas: procesar analytics y estadísticas
   - Eventos: product:viewed, order:created
   - Reintentos: 1
   - Delay: agregado (cada hora)

   COLA: reportQueue
   - Tareas: generar reportes PDF/Excel
   - Eventos: report:requested
   - Reintentos: 2
   - Delay: inmediato

3. Procesadores de colas en queues/processors/

   emailQueue processor:
   - Recibir: {tipo, usuario, datos}
   - Función: enviar email con Nodemailer
   - Retry si falla red
   - Log success/failure

   imageQueue processor:
   - Recibir: {url, producto_id}
   - Función: descargar, redimensionar a 5 tamaños
   - Subir a S3
   - Actualizar BD
   - Log de URL finales

   analyticsQueue processor:
   - Recibir: {evento, usuario, producto}
   - Función: agregar estadísticas
   - Actualizar tablas de analytics
   - Log de evento

   reportQueue processor:
   - Recibir: {tipo, usuario, filtros}
   - Función: generar PDF/Excel
   - Guardar en S3
   - Enviar link al usuario por email
   - Log de reporte

4. Eventos que disparan colas:

   En controllers/orderController.js:
   - Crear orden → agregar a emailQueue + analyticsQueue

   En controllers/productController.js:
   - Subir imagen → agregar a imageQueue

   En controllers/pagoController.js:
   - Pago confirmado → agregar a emailQueue

   En controllers/reportController.js:
   - Generar reporte → agregar a reportQueue

5. Monitoreo en utils/queueMonitor.js:
   - Contar jobs en cada cola
   - Logs de errores
   - Dashboard (opcional)

6. Configuración retry:
   - Exponential backoff
   - Max retries: 3-5 según cola
   - Timeout: 30-300 segundos

7. Environment variables:
   - BULL_REDIS_URL
   - QUEUE_ENABLED (true/false)

Incluye: manejo de errores, logging completo, escalabilidad"
```

---

## P15: SUBIDA DE IMÁGENES A S3
**Tokens:** 950  
**Tiempo:** 28 minutos  
**Para qué:** Almacenar imágenes de forma escalable

```
PROMPT PARA CLAUDE:

"Crea sistema de upload a AWS S3 para ConnectModa:

1. Instalación:
   - npm install aws-sdk multer sharp

2. Configurar AWS en utils/awsConfig.js:
   - AWS_REGION (us-east-1)
   - AWS_ACCESS_KEY_ID
   - AWS_SECRET_ACCESS_KEY
   - S3_BUCKET_NAME
   - S3_BASE_URL

3. Middleware de upload en middleware/upload.js:
   - multer configurado
   - Tipos permitidos: jpg, png, webp
   - Tamaño máximo: 10MB
   - Almacenamiento temporal
   - Validación de archivo

4. utils/s3Service.js:
   - uploadImage (archivo, carpeta)
     * Validar archivo
     * Comprimir con Sharp
     * Generar tamaños (thumbnail, medium, full)
     * Subir a S3
     * Retornar URLs
     * Eliminar archivo temporal

   - deleteImage (URL o key)
     * Eliminar de S3
     * Validar permisos
     * Log de eliminación

   - generatePresignedURL (key, expiration)
     * URL temporal para descarga
     * Expira en 1 hora

5. controllers/uploadController.js:
   - uploadProductoImage (POST)
     * Recibir archivo multipart
     * Validar usuario autenticado
     * Validar producto pertenece a usuario
     * Llamar a uploadImage
     * Retornar URLs de imagen

   - uploadAvatarUsuario (POST)
     * Recibir archivo
     * Validar es usuario
     * Eliminar avatar anterior (si existe)
     * Subir nuevo
     * Actualizar BD
     * Retornar URL

   - deleteImage (DELETE)
     * Validar permisos
     * Eliminar de S3
     * Actualizar BD
     * Retornar confirmación

6. routes/upload.js:
   - POST /api/upload/producto
   - POST /api/upload/avatar
   - DELETE /api/upload/:imageId

7. Estructura S3:
   connectmoda/
   ├── productos/
   │   ├── {productId}/
   │   │   ├── full.webp
   │   │   ├── medium.webp
   │   │   └── thumb.webp
   ├── usuarios/
   │   ├── {userId}/
   │   │   └── avatar.webp
   └── reportes/
       └── {reportId}.pdf

8. Opciones alternativas (gratis):
   - Cloudinary API (gratis: 25 GB/mes)
   - Firebase Storage (5 GB gratis)
   - Supabase Storage (1 GB gratis)

Incluye: validación, compresión, manejo de errores"
```

---

# 🔵 NIVEL EXPERTO (1500+ tokens)

## P16: ANALYTICS Y REPORTES
**Tokens:** 1300  
**Tiempo:** 40 minutos  
**Para qué:** Entender negocio con datos

```
PROMPT PARA CLAUDE:

"Crea sistema de analytics para ConnectModa:

1. Model Analytics (Mongoose):
   - tipo: (page_view, product_view, search, purchase)
   - usuario (referencia, nullable)
   - producto (referencia, nullable)
   - datos: JSON flexible
   - timestamp

   Índices: timestamp, usuario, tipo, producto

2. Model Estadística (agregada):
   - fecha: date
   - total_visitas: número
   - total_usuarios_únicos: número
   - total_búsquedas: número
   - total_ventas: número
   - ingresos: número
   - top_productos: array
   - top_categorías: array
   - conversion_rate: número

3. Eventos a registrar en analytics:
   - GET /api/productos/:id → product_view
   - GET /api/buscar → search
   - POST /api/ordenes → purchase
   - GET /api/productos → page_view

4. controllers/analyticsController.js:
   - getDashboard (GET)
     * Período: hoy, semana, mes, año
     * Retornar: visitas, usuarios, ventas, ingresos
     * Gráficos: tendencia, top productos

   - getProductoAnalytics (GET/:productoId)
     * Vistas, conversión, ingresos
     * Resumen comparativo
     * Gráficos de rendimiento

   - getUsuarioAnalytics (GET)
     * Para emprendedor: sus productos
     * Vistas, ventas, ingresos
     * Comparación período

   - generarReporte (POST)
     * Tipo: ventas, productos, usuarios
     * Período: fecha inicio/fin
     * Formato: PDF o Excel
     * Enviar por email a Cola

5. Agregaciones de MongoDB:
   - Pipeline para contar visitas
   - Pipeline para sumar ingresos
   - Pipeline para top productos
   - Pipeline para conversion rate

6. charts/reportController.js:
   - Generar datos para gráficos
   - Formato: JSON para Chart.js
   - Datos: líneas, barras, donas

7. routes/analytics.js:
   - GET /api/analytics/dashboard
   - GET /api/analytics/producto/:id
   - GET /api/analytics/usuario
   - POST /api/analytics/reporte

8. Herramientas opcionales:
   - Chart.js (frontend)
   - ECharts (alternativa)
   - Metabase (BI gratis)

Incluye: agregaciones eficientes, caché, exportación"
```

---

## P17: MICROSERVICIOS
**Tokens:** 1400  
**Tiempo:** 45 minutos  
**Para qué:** Separar funcionalidades en servicios independientes

```
PROMPT PARA CLAUDE:

"Crea arquitectura de microservicios para ConnectModa:

1. Servicios separados:

   SERVICE-USERS (Puerto 3001)
   - POST /register, /login
   - GET /perfil, /usuario/:id
   - PUT /perfil
   - DELETE /usuario

   SERVICE-PRODUCTS (Puerto 3002)
   - POST /crear, GET /listar, GET /:id
   - PUT /:id, DELETE /:id
   - GET /buscar, GET /categorías

   SERVICE-ORDERS (Puerto 3003)
   - POST /crear, GET /listar
   - GET /:id, PATCH /:id/estado
   - POST /:id/cancelar

   SERVICE-PAYMENTS (Puerto 3004)
   - POST /intento-pago
   - POST /confirmar
   - GET /lista (admin)
   - POST /reembolso

   SERVICE-NOTIFICATIONS (Puerto 3005)
   - WebSocket: eventos en tiempo real
   - POST /email
   - POST /sms
   - POST /push

   SERVICE-ANALYTICS (Puerto 3006)
   - POST /registrar-evento
   - GET /dashboard
   - GET /reportes
   - POST /generar-reporte

2. API Gateway (Puerto 3000):
   - Enrutar requests a servicios
   - Autenticación centralizada
   - Rate limiting
   - Logging

3. Comunicación entre servicios:
   - HTTP REST para queries
   - Message Queue (RabbitMQ/Bull) para eventos
   - Redis para caché compartido

4. Estructura carpetas:
   service-users/
   ├── server.js
   ├── controllers/
   ├── routes/
   ├── models/
   ├── middleware/
   └── package.json
   
   service-products/
   ├── (igual estructura)
   
   api-gateway/
   ├── server.js
   ├── routes/ (enrutamiento)
   ├── middleware/ (auth, rate limit)
   └── package.json

5. Docker Compose para levantar todo:
   - Cada servicio en contenedor
   - Redis compartido
   - MongoDB
   - RabbitMQ

6. Environment variables (.env en cada servicio):
   - SERVICE_PORT
   - SERVICE_NAME
   - DATABASE_URL
   - JWT_SECRET
   - OTROS_SERVICES_URLS

7. Health checks:
   - GET /health en cada servicio
   - Gateway verifica disponibilidad

Incluye: tolerancia a fallos, circuit breaker, trazabilidad"
```

---

## P18: TESTING AUTOMATIZADO
**Tokens:** 1250  
**Tiempo:** 38 minutos  
**Para qué:** Encontrar bugs antes de producción

```
PROMPT PARA CLAUDE:

"Crea suite de tests para ConnectModa:

1. Instalación:
   - npm install jest supertest @faker-js/faker

2. Estructura carpetas:
   __tests__/
   ├── unit/
   │   ├── controllers/
   │   ├── models/
   │   └── utils/
   ├── integration/
   │   ├── routes/
   │   └── services/
   └── e2e/
       └── flows/

3. Unit Tests - Controllers:
   - Test crear orden exitoso
   - Test crear orden sin usuario
   - Test crear orden sin carrito
   - Test error de validación
   - Mock de bases de datos
   - Mock de servicios externos

4. Unit Tests - Models:
   - Test validación de datos
   - Test pre-hooks (hash de contraseña)
   - Test índices

5. Integration Tests - Routes:
   - POST /api/auth/register → usuario creado en BD
   - POST /api/productos → producto guardado
   - GET /api/productos → listar correctamente
   - PUT /api/productos/:id → actualizar
   - DELETE /api/productos/:id → eliminar

6. E2E Tests - Flujos completos:
   - Registrar usuario → Login → Crear producto → Comprar
   - Crear orden → Pagar con Stripe → Recibir confirmación
   - Búsqueda avanzada con todos los filtros

7. Fixtures y seeders en __tests__/fixtures/

8. Setup en __tests__/setup.js:
   - Conectar BD test
   - Limpiar datos después cada test
   - Mocks de servicios externos

9. package.json scripts:
   - 'npm test' → correr todos
   - 'npm run test:unit' → solo unit
   - 'npm run test:watch' → modo watch
   - 'npm run test:coverage' → cobertura

10. GitHub Actions para CI:
    - Correr tests en cada PR
    - Fallar si cobertura < 80%
    - Reportar resultados

Incluye: mocks, fixtures, cobertura al 80%"
```

---

## P19: CI/CD COMPLETO
**Tokens:** 1350  
**Tiempo:** 42 minutos  
**Para qué:** Automatizar despliegues seguros

```
PROMPT PARA CLAUDE:

"Crea pipeline CI/CD para ConnectModa:

1. GitHub Actions (.github/workflows/):

   FILE: test.yml
   - Trigger: push a main/develop, PRs
   - Pasos:
     * Setup Node.js
     * npm install
     * npm run lint (ESLint)
     * npm run test (Jest)
     * npm run test:coverage (reportar cobertura)
   - Fallar si tests no pasan

   FILE: deploy-staging.yml
   - Trigger: push a develop
   - Pasos:
     * Correr tests
     * Build Docker image
     * Push a Docker registry
     * Deploy a servidor staging
     * Smoke tests en staging

   FILE: deploy-production.yml
   - Trigger: release (manual o tag)
   - Pasos:
     * Correr tests
     * Build Docker image
     * Push a Docker registry
     * Deploy a producción (rolling)
     * Smoke tests
     * Rollback automático si falla

2. Docker (Dockerfile):
   - FROM node:18-alpine
   - WORKDIR /app
   - COPY package*.json .
   - RUN npm ci --only=production
   - COPY . .
   - EXPOSE 5000
   - CMD ['node', 'server.js']

3. docker-compose.yml:
   - service: app
   - service: mongodb
   - service: redis
   - Volúmenes, ports, networks

4. Linting y Formatting:
   - ESLint (.eslintrc.json)
   - Prettier (.prettierrc)
   - Pre-commit hooks (husky)

5. Securityscan:
   - npm audit
   - SAST con Snyk o similar

6. Environments:
   - .env.development
   - .env.staging
   - .env.production (secrets en GitHub)

7. Deployment targets:
   - Staging: Railway, Render o similar (gratis)
   - Producción: Heroku, Railway, AWS, Digital Ocean

8. Monitoreo post-deploy:
   - Health checks
   - Error tracking (Sentry)
   - Logs centralizados

Incluye: rollback automático, notificaciones, audit trail"
```

---

## P20: ESCALABILIDAD HORIZONTAL
**Tokens:** 1500  
**Tiempo:** 45 minutos  
**Para qué:** Manejar millones de usuarios

```
PROMPT PARA CLAUDE:

"Crea plan de escalabilidad para ConnectModa:

1. Load Balancer (Nginx):
   - Distribuir tráfico entre servidores
   - Sticky sessions para WebSocket
   - Health checks
   - Failover automático

2. Servidores de aplicación (múltiples):
   - 3-5 instancias del backend
   - Stateless (sin sesiones locales)
   - Auto-scaling basado en CPU/RAM
   - Blue-green deployments

3. Base de datos (MongoDB):
   - Replica set (3 nodos)
   - Sharding por usuario_id
   - Backups automáticos
   - Geo-redundancia

4. Cache distribuido (Redis):
   - Cluster Redis (6 nodos)
   - Replicación
   - Persistencia

5. Cola de mensajes (RabbitMQ):
   - Cluster de brokers
   - Durabilidad de mensajes
   - Multiple consumers

6. CDN para assets:
   - CloudFlare (gratis/pago)
   - Imágenes servidas desde edge
   - Cachés HTTP headers

7. Monitoreo y alertas:
   - Prometheus + Grafana
   - Sentry para errores
   - CloudWatch logs
   - Alertas en Slack

8. Estructura de carpetas:
   - Separar código por microservicios
   - Repositorio mono o multi-repo
   - Documentación de deploy

9. Plan de escalado por fases:

   FASE 1 (0-10K usuarios):
   - 1 servidor, 1 MongoDB, 1 Redis
   - Costo: $20/mes

   FASE 2 (10K-100K):
   - 3 servidores + load balancer
   - MongoDB replica set
   - Redis cluster
   - Costo: $100-200/mes

   FASE 3 (100K-1M+):
   - 10+ servidores auto-scaling
   - Microservicios
   - Kubernetes
   - CDN global
   - Costo: $500+/mes

10. Kubernetes (opcional para fase 3):
    - Deployments, Services, ConfigMaps
    - Ingress para enrutamiento
    - Persistent Volumes para BD
    - Auto-scaling horizontal

Incluye: métricas, SLOs, planes de contingencia"
```

---

# 📈 ORDEN RECOMENDADO POR SEMANA

```
SEMANA 1: BASES
├─ P1: Setup Express + MongoDB (150 tokens)
├─ P2: Modelos de datos (200 tokens)
├─ P3: CRUD básico (180 tokens)
└─ P4: Validaciones (120 tokens)
SUBTOTAL: 650 tokens

SEMANA 2: AUTENTICACIÓN + CARRITO
├─ P5: Autenticación JWT (400 tokens)
├─ P6: Roles y permisos (350 tokens)
├─ P7: Carrito de compras (450 tokens)
└─ P8: Búsqueda avanzada (380 tokens)
SUBTOTAL: 1,580 tokens

SEMANA 3: PAGOS + TIEMPO REAL
├─ P9: Sistema de órdenes (750 tokens)
├─ P10: Integración Stripe (850 tokens)
└─ P11: WebSockets (900 tokens)
SUBTOTAL: 2,500 tokens

SEMANA 4: OPTIMIZACIÓN
├─ P12: Cache Redis (800 tokens)
├─ P13: Recomendaciones IA (1,200 tokens)
├─ P14: Colas de trabajo (1,100 tokens)
└─ P15: Subida S3 (950 tokens)
SUBTOTAL: 4,050 tokens

SEMANA 5+: ESCALA
├─ P16: Analytics (1,300 tokens)
├─ P17: Microservicios (1,400 tokens)
├─ P18: Testing (1,250 tokens)
├─ P19: CI/CD (1,350 tokens)
└─ P20: Escalabilidad (1,500 tokens)
SUBTOTAL: 6,800 tokens

TOTAL: 15,580 tokens (~$5-10 USD)
```

---

# 🎯 RESUMEN TABLA RÁPIDA

| # | Proceso | Dificultad | Tokens | Tiempo | Prioridad |
|---|---------|-----------|--------|--------|-----------|
| P1 | Setup Express | 🟢 | 150 | 10m | 1️⃣ |
| P2 | Modelos BD | 🟢 | 200 | 15m | 2️⃣ |
| P3 | CRUD Básico | 🟢 | 180 | 12m | 3️⃣ |
| P4 | Validaciones | 🟢 | 120 | 10m | 4️⃣ |
| P5 | JWT Auth | 🟡 | 400 | 20m | 5️⃣ |
| P6 | Roles/Permisos | 🟡 | 350 | 15m | 6️⃣ |
| P7 | Carrito | 🟡 | 450 | 18m | 7️⃣ |
| P8 | Búsqueda | 🟡 | 380 | 16m | 8️⃣ |
| P9 | Órdenes | 🔴 | 750 | 25m | 9️⃣ |
| P10 | Stripe | 🔴 | 850 | 30m | 🔟 |
| P11 | WebSockets | 🔴 | 900 | 28m | 1️⃣1️⃣ |
| P12 | Redis | 🔴 | 800 | 25m | 1️⃣2️⃣ |
| P13 | IA | 🟣 | 1,200 | 35m | 1️⃣3️⃣ |
| P14 | Colas | 🟣 | 1,100 | 32m | 1️⃣4️⃣ |
| P15 | S3 | 🟣 | 950 | 28m | 1️⃣5️⃣ |
| P16 | Analytics | 🔵 | 1,300 | 40m | 1️⃣6️⃣ |
| P17 | Microservicios | 🔵 | 1,400 | 45m | 1️⃣7️⃣ |
| P18 | Testing | 🔵 | 1,250 | 38m | 1️⃣8️⃣ |
| P19 | CI/CD | 🔵 | 1,350 | 42m | 1️⃣9️⃣ |
| P20 | Escalabilidad | 🔵 | 1,500 | 45m | 2️⃣0️⃣ |

---

# 🚀 CÓMO USAR ESTO

1. **Copia un PROMPT** completo
2. Pega en https://claude.ai (o tu IA)
3. Claude genera TODO el código
4. Copia el código a tu repo
5. Prueba con `node server.js`
6. Ajusta según necesites

**Total gratis: $0 USD** ✅

¿Por cuál proceso quieres empezar?
