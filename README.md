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
- **¿Olvidaste tu contraseña?** en el login:
  - *Con correo*: se envía un código de 6 dígitos (10 min, máx. 5 por hora) y con él se elige una
    contraseña nueva; se cierran las demás sesiones y se quita el bloqueo. La pantalla no revela si
    el correo existe.
  - *Sin correo*: usuario + cédula registrada en la cuenta (Usuarios → Cédula). Si coinciden se
    muestra una contraseña temporal una sola vez. Los fallos cuentan para el bloqueo de 15 min.
- Contraseña temporal, inicial (alta por un admin) o restablecida por un admin: al entrar se pide
  cambiarla y la API responde 403 a todo lo demás hasta hacerlo.
- Endpoints: `POST /api/auth/login`, `/verificar-correo`, `/reenviar-codigo`, `/recuperar`,
  `/recuperar/confirmar`, `/recuperar/cedula`, `/cambiar-contrasena`, `/logout`, `GET /api/auth/sesion`; cuentas (solo admin): `GET/POST /api/usuarios`, `PUT /api/usuarios/:id`
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

Una cuenta con rol técnico debe estar vinculada a su ficha (`tecnico_id`).

- **Trabajo de campo** (pantalla de inicio del técnico, pensada para móvil): registra un trabajo eligiendo
  cliente y vehículo existentes (búsqueda por nombre) o proponiendo nuevos, con IMEI, SIM, tipo, fecha y notas.
  Queda **pendiente**: no cambia el inventario hasta que un administrador lo apruebe. Ve sus trabajos
  (pendiente/aprobado/rechazado con motivo) y lo que se le debe y ya cobró.
- **Fotos del trabajo**: en *Nuevo trabajo* el técnico toma fotos con la cámara del teléfono (una por toque,
  las veces que quiera) o adjunta varias de la galería, hasta 10. Se suben al enviar, ya reducidas; si alguna
  falla se agrega desde *Mis trabajos* mientras esté pendiente. El admin las ve al aprobar y pasan a la
  galería del vehículo.
- **Mis instalaciones**: avance (estado y notas) y fotos de sus trabajos; solo borra las fotos que subió.
- **Filtros de instalaciones**: periodo (esta semana, este mes, mes anterior, este año o rango), técnico, tipo y
  estado, con el total y el conteo por técnico (pulsar un técnico filtra por él). El técnico solo cuenta lo suyo.
- **Cuentas de técnicos**: en Usuarios, "Técnicos sin cuenta" crea el acceso ya ligado a la ficha; al entrar,
  el técnico ve todas las instalaciones registradas a su nombre (incluidas las importadas).
- **Aprobaciones** (admin): revisa cada trabajo, ve posibles duplicados (cliente con el mismo nombre, vehículo
  con la misma placa, GPS ya instalado) y decide unirlos o crearlos; fija el costo del técnico y, si quiere,
  el plan de cobro. Aprobar hace todo en una transacción; si el GPS está instalado en otro vehículo no se
  aprueba y no se crea nada. Rechazar exige motivo, que ve el técnico.
- **Costos técnicos** (admin): deuda por técnico, marcar trabajos como pagados con referencia (todo o nada) y
  desmarcar con motivo auditado.

## App para técnicos (PWA)

El portal se instala en el teléfono como app: en *Trabajo de campo* o *Mis instalaciones* el técnico toca
**Descargar app**. En Android (Chrome/Edge) aparece el diálogo de instalación; en iPhone se indican los pasos
(Safari → Compartir → *Añadir a pantalla de inicio*). Se abre a pantalla completa y sin conexión muestra un
aviso para reintentar. Requiere servir el portal por HTTPS. Los datos y las fotos siempre van a la API: la
app no guarda información de clientes en el teléfono.

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
0004 (modelo ampliado), 0005 (retira el tipo en texto) y 0006 (importación) también están aplicadas. El Excel real no está importado ni versionado;
su importador transaccional se construirá en la fase 6.

Skills oficiales Supabase en `.agents/skills`, registradas mediante `opencode.json`.
