# Pastelería · Proyecto parcial 2

Panel de administración de La Casa del Postre con registro, inicio y cierre de sesión, CRUD de usuarios y CRUD de productos. El backend reutiliza Express, SQLite y el módulo de productos de la API original. Todas las cuentas tienen los mismos permisos: cualquier sesión iniciada puede usar los módulos Usuarios y Productos, y sin sesión las rutas protegidas responden `401`. Las contraseñas se guardan con scrypt y las sesiones se pueden revocar.

## Ejecutar en local

Con Node.js 22 y npm:

```sh
npm ci
ADMIN_EMAIL=admin@example.test ADMIN_PASSWORD='solo-para-local-2026' npm start
```

Abre http://localhost:3000. `ADMIN_EMAIL` y `ADMIN_PASSWORD` son opcionales: si la base no tiene ninguna cuenta, el primer inicio crea una con esos datos. SQLite conserva las cuentas en siguientes inicios.

### Registrar una cuenta y entrar

1. En la pantalla de inicio de sesión, haz clic en «Crear cuenta».
2. Escribe tu nombre, correo y una contraseña de 12 a 128 caracteres, y confírmala. El correo no distingue mayúsculas; si ya está registrado, el formulario lo indica.
3. Al crear la cuenta vuelves al inicio de sesión con el correo ya escrito. Escribe la contraseña y pulsa «Entrar».
4. Verás los módulos Productos y Usuarios. Desde ahí puedes crear, editar y eliminar productos y cuentas. No puedes eliminar la cuenta con la que iniciaste sesión.
5. «Cerrar sesión» invalida el token en el servidor.

También puedes registrar una cuenta desde la API con `POST /api/auth/register` y el cuerpo `{"nombre", "email", "password"}`, e iniciar sesión con `POST /api/auth/login`, que devuelve un token para el encabezado `Authorization: Bearer <token>`. El servicio TCP heredado se ejecuta únicamente con `ENABLE_TCP=true`; en el despliegue del parcial queda deshabilitado.

```sh
npm test -- --runInBand
npx playwright install chromium
npm run test:e2e
```

Jest y Supertest verifican las rutas de Express, el registro y que las rutas protegidas respondan `401` sin sesión. Playwright levanta una aplicación con una base separada y verifica desde Chromium que una cuenta recién registrada inicie sesión y use los dos CRUD.

### Reporte de Playwright

Ejecuta `npm run test:e2e -- --reporter=list,html` para generar `playwright-report/index.html`. Abre un caso para ver su precondición, pasos, resultado esperado, estado y duración. La suite usa Chromium y una base SQLite temporal.

### Reintentos y validaciones de la API

`POST /api/productos` acepta el encabezado opcional `Idempotency-Key`. Al reintentar la misma alta para la misma cuenta, envía la clave y los datos originales. El servidor devuelve el producto existente con HTTP 200. Si la clave se usó con otros datos, devuelve 409. Dos altas intencionales deben usar claves distintas.

Los productos requieren un nombre de 1 a 100 caracteres y un precio numérico no negativo. El stock debe ser un número entero no negativo y la descripción admite hasta 500 caracteres. Borrar una categoría con productos asociados responde HTTP 409 y conserva los registros.

## Publicar y desplegar

1. Publica este repositorio en GitHub y crea el repositorio de imágenes de Docker Hub. La cuenta usada por Actions debe poder publicar. Si la imagen es privada, autentica Docker también en EC2.
2. En una instancia EC2 Linux con Docker y Compose, copia los archivos de `deploy/` a `~/pasteleria-front/`. Copia `.env.example` a `.env` en ese directorio y reemplaza los valores de ejemplo. Protege el archivo con `chmod 600 .env`. Configura un proxy inverso HTTPS hacia `127.0.0.1:3000`. Usa un usuario de despliegue con acceso a Docker, y permite el SSH del workflow según la configuración de red de EC2.
3. Crea las variables de GitHub Actions `DOCKERHUB_IMAGE`, `OPENOBSERVE_ENDPOINT` y `EC2_FINGERPRINT`. La imagen debe coincidir con `APP_IMAGE` de EC2. El endpoint es la URL HTTPS de la organización de OpenObserve, con formato `https://host/api/organizacion`.
4. Crea los secrets de Actions `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` y `OPENOBSERVE_AUTH`. El último incluye el prefijo `Basic ` y el valor que entrega OpenObserve para autorizar la ingesta. Guarda los accesos fuera del repositorio.
5. Ejecuta el flujo con un push a `main`. Después de Jest y Playwright, la imagen se publica para ARM64 y AMD64. EC2 descarga el tag del commit y espera el chequeo de salud del contenedor. SQLite queda en el volumen `sqlite`.

## Verificar OpenObserve

- En Logs, abre `pasteleria_cicd` para revisar el resultado de las pruebas, los eventos de despliegue, commit, rama, actor y ejecución.
- En `pasteleria_app`, busca el método, endpoint, código HTTP, duración y fecha de una petición. Abre su traza y verifica que incluya la operación de SQLite.
- Crea un tablero de aplicación con solicitudes por segundo y tasa de respuestas 5xx, agrupadas por endpoint. Usa `pasteleria.http.requests` para contar solicitudes y el histograma `pasteleria.http.duration` para graficar la latencia, por ejemplo p95.
- En el tablero de infraestructura agrega CPU y RAM como porcentajes y la variación de bytes de red por segundo para entrada y salida. El Collector genera estas series a partir de `system.cpu.utilization`, `system.memory.utilization` y `system.network.io`. El receptor Prometheus recolecta `node_thermal_zone_temp` si Linux expone zonas térmicas. Si la instancia no proporciona la serie, documenta la evidencia.
- Crea una alerta de fallo de CI filtrando `event = 'tests'` y `result = 'failure'` en `pasteleria_cicd`. Crea una alerta de tasa elevada de 5xx y verifica sus consultas con datos del servidor.

## Evidencias del parcial

En un entorno de demostración, registra el hash de un commit que introduzca un fallo visual detectable por Playwright. Captura la prueba fallida, el job de despliegue omitido y el evento de fallo en OpenObserve. Corrige el fallo en otro commit, verifica el despliegue por SSH y captura el evento de éxito. Agrega evidencias de login, CRUD, tableros, alerta y una traza HTTP. Incluye los enlaces reales y entrega credenciales de evaluación por un canal privado.
