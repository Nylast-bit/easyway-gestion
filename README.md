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

Las fotos de vehículos viven en el bucket privado `vehicles` de Supabase Storage y se
muestran con enlaces firmados que caducan a los 10 minutos. Sin `SUPABASE_URL`/`SUPABASE_SECRET_KEY`,
la API de desarrollo guarda las fotos en `.almacen-local/` (ignorado por Git) con el mismo
comportamiento. `npm run storage:verificar` comprueba el bucket real con un archivo de prueba
que se borra al terminar.

## Autenticación

- Inicio de sesión con nombre de usuario o correo y contraseña. Las cuentas que tienen
  correo lo verifican **una vez** con un código de 6 dígitos enviado por Resend; las cuentas
  solo con usuario no tienen ese paso.
- 5 intentos fallidos bloquean la cuenta 15 minutos. La sesión dura 12 horas.
- Configurar `RESEND_API_KEY` y `CORREO_REMITENTE` (dominio verificado en Resend). Sin
  ellas, en desarrollo el código aparece en la consola de la API; en producción son obligatorias.
- Primer administrador: `npm run db:crear-admin` en una terminal pide nombre, usuario y/o correo
  y la contraseña (oculta). Es idempotente: si ya hay un administrador no cambia nada. Para
  automatizarlo acepta `ADMIN_NOMBRE`, `ADMIN_USUARIO`, `ADMIN_CORREO` y `ADMIN_CONTRASENA`.
  Con correo, el primer inicio de sesión pedirá el código enviado a ese correo.
- Resto de cuentas: pantalla **Usuarios** (solo administradores). Alta de administradores o
  técnicos vinculados a su ficha, activar/desactivar y restablecer contraseña; desactivar o
  restablecer cierra las sesiones abiertas de esa cuenta.
- Endpoints: `POST /api/auth/login`, `/verificar-correo`, `/reenviar-codigo`, `/logout`,
  `GET /api/auth/sesion`; cuentas (solo admin): `GET/POST /api/usuarios`, `PUT /api/usuarios/:id`
  y `PUT /api/usuarios/:id/contrasena`.

## Gestión y transacciones

- Clientes, técnicos, vehículos, GPS, simcards e instalaciones: `GET/POST /api/<entidad>`,
  `GET/PUT/DELETE /api/<entidad>/:id` (solo administradores). Además `GET /api/resumen`,
  `GET /api/buscar?q=` y `GET /api/simcards/:id/historial`.
- Asignar o cambiar el GPS de un vehículo, o la simcard de un GPS, es una sola transacción:
  cierra la asignación anterior (conserva el historial), libera el equipo anterior y bloquea
  el nuevo. Si el equipo no está disponible, no se guarda nada (409).
- Marcar un GPS como Retirado, Dañado o Disponible lo retira del vehículo.
- No se pueden borrar registros con historial (vehículos con instalaciones, GPS asignados…): 409.
  Borrar un vehículo sin historial elimina también sus fotos.
- Fotos: `GET /api/fotos?vehiculo_id=`, `POST /api/fotos` (multipart `vehiculo_id` + `archivo`;
  JPG/PNG/WebP, máx. 8 MB, 5 por vehículo) y `DELETE /api/fotos/:id`.

## Cobros y vencimientos

- **Cobros** (menú): resumen de lo pendiente, vencido y cobrado en el mes; clientes con saldo y su
  estado de cuenta. Desde ahí se asigna un plan a cada vehículo, se registran pagos (se aplican a
  los cargos más antiguos; lo que sobra queda a favor), se crean cargos sueltos y se anulan cargos o
  pagos con motivo. Las facturas fiscales siguen en el sistema contable: se anota su número/NCF.
- **Generar cargos** crea un cargo por cada periodo vencido de los planes activos; repetirlo no duplica.
- **Planes**: catálogo editable (hoy Plan Anual RD$5,500). Un plan se desactiva, no se borra.
- **Vencimientos** (menú): GPS (1 año desde la instalación), SIM (1 año si no tenía fecha) y planes por
  cobrar en 30/60/90 días o 1 año, con los vencidos primero; la fecha de GPS/SIM se puede corregir.
- Todas estas acciones quedan en la auditoría (`GET /api/auditoria`).

## Importar el Excel

Menú **Importar**: se sube el Excel de control (hoja "Data de instalaciones e cliente"). Analizar no crea
nada; muestra cuántos clientes, vehículos, GPS, SIM e instalaciones se crearán, las filas con errores o
advertencias y permite decidir qué hacer con cada técnico, plan y tipo de servicio escrito en el Excel
(crear, usar uno existente, unir alias como "Gabo" → "Gabo Chamo" o dejar sin técnico/plan). Al confirmar
todo se crea en una transacción: el historial de cada GPS y SIM se reconstruye por fecha, los GPS quedan
con vencimiento a 1 año de su última instalación y, si se marca, se crean planes de cobro desde la próxima
renovación (sin deuda de años pasados). El mismo archivo no se importa dos veces. **Revertir** borra solo lo
importado y se niega si algo creado después lo usa (cargos, pagos, fotos, instalaciones nuevas).

## Técnicos

Una cuenta con rol técnico debe estar vinculada a su ficha (`tecnico_id`). En la web solo ve
"Mis instalaciones": puede actualizar estado y notas de sus trabajos y subir fotos de esos
vehículos; solo borra las fotos que subió. No ve clientes, inventario ni trabajos de otros técnicos.

## Verificación

| Comando | Qué ejecuta |
| --- | --- |
| `npm run lint` | oxlint en código de aplicación y herramientas |
| `npm run typecheck` | tipos de todos los workspaces, generación de rutas Next y herramientas BD |
| `npm run test:unit` | guardas de commits y Vitest web/API/shared; sin red ni Docker |
| `npm run test:int` | PostgreSQL 16 efímero: migraciones y flujos de autenticación de la API; requiere Docker, nunca usa DATABASE_URL |
| `npm test` | unitarias + integración |
| `npm run test:e2e` | Chromium, Next aislado en 3100 con API simulada; detener antes cualquier `next dev` local |
| `npm run test:capturas` | Capturas de todas las pantallas en móvil, tablet, laptop y PC (`capturas/`); falla con desbordes o texto recortado |
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
- `npm run db:historial`: compara las migraciones aplicadas en el destino con las del repositorio (solo lectura).
- `npm run db:crear-admin`: primer administrador a partir de variables `ADMIN_*`.
- `npx tsx scripts/db/verificar-storage.ts`: metadatos del bucket privado.

Ver [docs/migracion-bd.md](docs/migracion-bd.md). Las migraciones 0000/0001 están
aplicadas en Supabase PostgreSQL 17.11, junto con 0002 (autenticación) y 0003 (autor de fotos).
0004 (modelo ampliado) y 0005 (retira el tipo en texto) también están aplicadas. El Excel real no está importado ni versionado;
su importador transaccional se construirá en la fase 6.

Skills oficiales Supabase en `.agents/skills`, registradas mediante `opencode.json`.
