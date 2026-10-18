# Easyway GPS Gestión

Monorepo npm para gestionar clientes, vehículos, inventario e instalaciones GPS.
**Seguimiento por fase y tarea: [PROGRESO.md](PROGRESO.md).**

## Desarrollo

Node 22 y npm. Desde la raíz:

```sh
npm ci
npm run dev
```

Arranca la API Hono en http://127.0.0.1:3001/api y la web Next.js en http://localhost:3000.
La web reenvía `/api/*` a la API (`API_URL`), así la cookie de sesión es del mismo origen.
Antes del primer uso: `npm run db:migrate` y crear el administrador (ver Autenticación).

| Directorio | Estado |
| --- | --- |
| `apps/web` | Next.js; rutas en `src/app`, pantallas migradas en `src/pantallas` |
| `apps/api` | API Hono (autenticación, usuarios), esquema Drizzle y correo OTP |
| `packages/shared` | Zod y normalizadores de texto, teléfono, correo y nombres |
| `scripts/db` | Migraciones, inspección de Supabase e integración PostgreSQL |

## Configuración y transición

Usar `.env.example` como referencia sin sobrescribir el `.env` privado existente.
Las herramientas de BD, la API y Next cargan también el `.env` raíz sin sustituir variables
ya presentes en el entorno. La web no tiene variables públicas: todos los datos pasan por
la API Hono (`/api`), que es la única con `DATABASE_URL` y claves de Supabase.

La BD tiene RLS sin políticas públicas; el backend usa el rol propietario y aplica su
propia autorización. No abrir RLS ni exponer claves privadas en la web.

El bucket `vehicles` es privado y se verificaron autenticación/listado con la API
de Supabase Storage. El adaptador de fotos con enlaces temporales llega en el bloque 3
de la fase 3; hasta entonces la gestión de fotos está deshabilitada en la UI.

## Autenticación

- Inicio de sesión con nombre de usuario o correo y contraseña. Las cuentas que tienen
  correo lo verifican **una vez** con un código de 6 dígitos enviado por Resend; las cuentas
  solo con usuario no tienen ese paso.
- 5 intentos fallidos bloquean la cuenta 15 minutos. La sesión dura 12 horas.
- Configurar `RESEND_API_KEY` y `CORREO_REMITENTE` (dominio verificado en Resend). Sin
  ellas, en desarrollo el código aparece en la consola de la API; en producción son obligatorias.
- Primer administrador (idempotente; datos solo en el entorno del comando):

  ```sh
  ADMIN_USUARIO=admin ADMIN_CONTRASENA='...' npm run db:crear-admin
  ```

  Con `ADMIN_CORREO` el administrador verificará su correo en el primer inicio de sesión.
- Endpoints: `POST /api/auth/login`, `/verificar-correo`, `/reenviar-codigo`, `/logout`,
  `GET /api/auth/sesion` y `POST /api/usuarios` (solo admin).

## Gestión y transacciones

- Clientes, técnicos, vehículos, GPS, simcards e instalaciones: `GET/POST /api/<entidad>`,
  `GET/PUT/DELETE /api/<entidad>/:id` (solo administradores). Además `GET /api/resumen`,
  `GET /api/buscar?q=` y `GET /api/simcards/:id/historial`.
- Asignar o cambiar el GPS de un vehículo, o la simcard de un GPS, es una sola transacción:
  cierra la asignación anterior (conserva el historial), libera el equipo anterior y bloquea
  el nuevo. Si el equipo no está disponible, no se guarda nada (409).
- Marcar un GPS como Retirado, Dañado o Disponible lo retira del vehículo.
- No se pueden borrar registros con historial (vehículos con instalaciones, GPS asignados…): 409.

## Verificación

| Comando | Qué ejecuta |
| --- | --- |
| `npm run lint` | oxlint en código de aplicación y herramientas |
| `npm run typecheck` | tipos de todos los workspaces, generación de rutas Next y herramientas BD |
| `npm run test:unit` | guardas de commits y Vitest web/API/shared; sin red ni Docker |
| `npm run test:int` | PostgreSQL 16 efímero: migraciones y flujos de autenticación de la API; requiere Docker, nunca usa DATABASE_URL |
| `npm test` | unitarias + integración |
| `npm run test:e2e` | Chromium, Next aislado en 3100 con API simulada; detener antes cualquier `next dev` local |
| `npm run build` | typecheck completo y build Next.js |
| `npm run preview` | servidor Next de producción después del build |

Antes de ejecutar e2e por primera vez: `npx playwright install chromium`.
Pruebas enfocadas:

```sh
npm run test --workspace=@easyway/shared -- -t telefono
npm run test --workspace=@easyway/web
npm run test:int -- -t RLS
```

Husky ejecuta lint-staged: bloquea `.env*` (salvo `.env.example`), respaldos y Excel
real, comprueba lint de código staged y tipos del workspace afectado. Ejecuta
`vitest related --run` para cambios locales; cambios globales/shared ejecutan todas
las pruebas rápidas. Docker y Playwright no se ejecutan en pre-commit.

## Base de datos

- `npm run db:generate -- --name=descripcion`: generar SQL y metadatos tras editar Drizzle.
- `npm run db:migrate`: aplicar migraciones pendientes usando DATABASE_URL.
- `npm run db:verify`: versión, tablas y RLS en modo solo lectura.
- `npm run db:crear-admin`: primer administrador a partir de variables `ADMIN_*`.
- `npx tsx scripts/db/verificar-storage.ts`: metadatos del bucket privado.

Ver [docs/migracion-bd.md](docs/migracion-bd.md). Las migraciones 0000/0001 están
aplicadas en Supabase PostgreSQL 17.11; 0002 (autenticación) está pendiente de aplicar. El Excel real no está importado ni versionado;
su importador transaccional se construirá en la fase 6.

Skills oficiales Supabase en `.agents/skills`, registradas mediante `opencode.json`.
