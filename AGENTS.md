# AGENTS.md

## Estado y límites

- Seguimiento verificable en `PROGRESO.md`: actualizar casillas al terminar cada tarea. No marcar una fase completa sin checks y commit.
- npm workspaces: `apps/web` es Next.js App Router; `apps/api` es Hono (`crearApp` inyectable en `src/app.ts`, entrada `src/servidor.ts`) + Drizzle; `packages/shared` exporta TS/Zod directamente (`src/index.ts`).
- Usar npm y Node 22. `package-lock.json` es vigente; ignorar `pnpm-lock.yaml` antiguo, no eliminarlo sin consultar.
- Rutas protegidas en `apps/web/src/app/(portal)` (layout con MainLayout); `/login` queda fuera. Pantallas en `src/pantallas`, nunca `src/pages` (Next crearía rutas Pages Router duplicadas). Sidebar en `src/layouts/MainLayout.tsx`: actualizar al añadir rutas.

## Comandos y comprobaciones

- `npm run dev`: API Hono en 127.0.0.1:3001 + Next en 3000 (concurrently); Next reenvía `/api/*` a `API_URL`. `npm run build`: tipos de todos los workspaces + build Next. Ejecutar antes de terminar.
- `npm run lint` usa oxlint, NO ESLint. `noUnusedLocals`/`noUnusedParameters` activos; web conserva tipado permisivo heredado, API/shared usan strict.
- `npm run typecheck`: incluye `next typegen` para evitar tipos de rutas obsoletos y `tsconfig.db.json` para herramientas.
- `npm run test:unit`: guardas de commits + Vitest por workspace. Enfoque: `npm run test --workspace=@easyway/shared -- -t telefono`.
- `npm run test:int`: PostgreSQL 16 efímero en Docker (`scripts/db/postgres-efimero.ts`), puerto local aleatorio, elimina su contenedor; no lee DATABASE_URL. Incluye `apps/api/src/**/*.int.test.ts` (excluidos del Vitest del workspace). Enfoque: `npm run test:int -- -t RLS`.
- `npm test`: unitarias + integración. `npm run test:e2e`: Playwright inicia Next en 3100, bloquea Supabase y simula la API en el navegador (`e2e/sesion.ts`: ruta genérica `**/api/**` y luego las específicas); falla si ya hay un `next dev` en marcha en `apps/web`. Instalar navegador con `npx playwright install chromium`.
- Pre-commit: lint-staged bloquea secretos/datos, lint de staged, tipos y tests relacionados rápidos; cambios globales/shared verifican todos los workspaces. No ejecutar Docker/e2e dentro del hook.
- Al cerrar fase: lint, typecheck, test, build y e2e pertinentes; actualizar README/PROGRESO y commit Conventional Commits.

## Variables y acceso

- `.env` raíz se carga sin sobrescribir el entorno por scripts de BD y `apps/web/next.config.ts`. Next también admite su `.env` de workspace.
- La web no usa Supabase ni variables `NEXT_PUBLIC_*`: todo dato pasa por `solicitarApi` (`apps/web/src/lib/api.ts`) hacia `/api`. Las pruebas web simulan `fetch` por ruta (`src/tests/preparacion.ts`).
- Rutas de gestión (`/api/clientes`, `tecnicos`, `vehiculos`, `gps`, `simcards`, `instalaciones`, `resumen`, `buscar`) exigen rol admin; el portal de técnicos y su aislamiento llegan en fase 7.
- Asignaciones GPS↔vehículo y SIM↔GPS solo en `apps/api/src/negocio/asignaciones.ts`, dentro de transacción con `FOR UPDATE`; cambian estados (`Instalado`/`Asignada`/`Disponible`) y cierran historial con `fecha_fin`, nunca lo borran. Errores PostgreSQL se traducen en `http/erroresBd.ts`.
- RLS sin políticas públicas es intencional: el backend usa el rol propietario; no abrir permisos anon.
- Storage: API Supabase, bucket privado `vehicles` verificado. Adaptador pendiente (bloque 3), solo backend: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET=vehicles`; nunca secretos en `NEXT_PUBLIC_`. Las fotos están deshabilitadas en la UI hasta entonces.

## Autenticación

- Sesiones propias: cookie httpOnly `easyway_sesion` (SameSite Lax, Secure en producción), 12 h; en BD solo SHA-256 del token. Contraseñas scrypt (node:crypto).
- Login por usuario o correo (`clasificarIdentificador` en shared). Toda cuenta con correo sin verificar recibe OTP de 6 dígitos por Resend (10 min, 5 intentos, reenvío cada 60 s, máx. 5) y se verifica una sola vez; cuentas solo con usuario no tienen OTP.
- 5 contraseñas fallidas bloquean 15 min. Mutaciones solo aceptan JSON (defensa CSRF junto a SameSite). Roles `admin`/`tecnico`: `requerirSesion` + `requerirRol`.
- Sin `RESEND_API_KEY`/`CORREO_REMITENTE` en desarrollo el OTP se imprime en la consola de la API; en producción son obligatorias. Plantilla HTML en `apps/api/src/correo/plantillaOtp.ts` (paleta #00b494).
- Primer admin: `ADMIN_USUARIO` y/o `ADMIN_CORREO` + `ADMIN_CONTRASENA` en el entorno y `npm run db:crear-admin` (idempotente).

## Base de datos y dominio

- `apps/api/src/db/esquema.ts` fue reconstruido desde frontend, no introspectado. Decisiones en `docs/migracion-bd.md`.
- `npm run db:generate -- --name=descripcion`: versionar SQL y metadatos de `apps/api/drizzle`. `npm run db:migrate` usa DATABASE_URL e historial Drizzle; no combinar SQL manual y migrador, ni usar drizzle-kit push.
- `npm run db:verify`: versión/tablas/RLS, transacción de solo lectura y sin credenciales en salida.
- Tablas exactas: `clientes`, `tecnicos`, `vehiculos`, `gps`, `simcards`, `instalaciones`, `gps_asignaciones`, `simcard_asignaciones`, `vehiculo_imagenes`, `usuarios`, `sesiones`, `verificaciones_correo`.
- Plan Anual y Plan Anual (monitoreo) son equivalentes; Plan Anual (Sin monit.) es distinto. America/Santo_Domingo; moneda DOP (RD$).
- Excel real y `backups/` ignorados; único fixture permitido: `tests/fixtures/excel-muestra.xlsx` anonimizado.
- Skills oficiales en `.agents/skills` registradas por `opencode.json`. Arquitectura/migraciones Drizzle prevalecen sobre ejemplos Supabase Auth/CLI.
- Comentarios y UI nuevos en español. Toasts react-hot-toast (proveedor en app), iconos lucide-react. Contratos Zod y tipos de respuesta de la API en `packages/shared/src/entidades.ts` (la web los importa de `@easyway/shared`).
