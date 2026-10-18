# AGENTS.md

## Estado y límites

- Seguimiento verificable en `PROGRESO.md`: actualizar casillas al terminar cada tarea. No marcar una fase completa sin checks y commit.
- npm workspaces: `apps/web` es Next.js App Router; `apps/api` solo tiene esquema Drizzle/validación (Hono llega en fase 3); `packages/shared` exporta TS/Zod directamente.
- Usar npm y Node 22. `package-lock.json` es vigente; ignorar `pnpm-lock.yaml` antiguo, no eliminarlo sin consultar.
- Rutas en `apps/web/src/app`; pantallas heredadas en `src/pantallas`, nunca `src/pages` (Next crearía rutas Pages Router duplicadas). Sidebar en `src/layouts/MainLayout.tsx`: actualizar al añadir rutas.

## Comandos y comprobaciones

- `npm run dev`: Next en puerto 3000; `npm run build`: tipos de todos los workspaces + build Next. Ejecutar antes de terminar.
- `npm run lint` usa oxlint, NO ESLint. `noUnusedLocals`/`noUnusedParameters` activos; web conserva tipado permisivo heredado, API/shared usan strict.
- `npm run typecheck`: incluye `next typegen` para evitar tipos de rutas obsoletos y `tsconfig.db.json` para herramientas.
- `npm run test:unit`: guardas de commits + Vitest por workspace. Enfoque: `npm run test --workspace=@easyway/shared -- -t telefono`.
- `npm run test:int`: PostgreSQL 16 efímero en Docker, puerto local aleatorio, elimina su contenedor; no lee DATABASE_URL. Enfoque: `npm run test:int -- -t RLS`.
- `npm test`: unitarias + integración. `npm run test:e2e`: Playwright inicia Next en 3100 con variables públicas vacías y bloquea Supabase; instalar navegador con `npx playwright install chromium`.
- Pre-commit: lint-staged bloquea secretos/datos, lint de staged, tipos y tests relacionados rápidos; cambios globales/shared verifican todos los workspaces. No ejecutar Docker/e2e dentro del hook.
- Al cerrar fase: lint, typecheck, test, build y e2e pertinentes; actualizar README/PROGRESO y commit Conventional Commits.

## Variables y acceso

- `.env` raíz se carga sin sobrescribir el entorno por scripts de BD y `apps/web/next.config.ts`. Next también admite su `.env` de workspace.
- Web transitoria: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Sin ellas muestra aviso de conexión pendiente; cliente inicializado al usarlo, no durante prerender. No sustituirlas por secretos.
- El CRUD heredado todavía vive en las pantallas y formularios con Supabase. Las pruebas web simulan ese cliente, no consultan el proyecto real. Se sustituye por Hono en fase 3.
- RLS sin políticas públicas es intencional: no abrir permisos anon para hacer funcionar el CRUD antiguo en la BD nueva.
- Storage: API Supabase, bucket privado `vehicles` verificado. Adaptador futuro solo backend: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET=vehicles`; nunca secretos en VITE_/NEXT_PUBLIC_. Código antiguo usa `vehiculos`/URLs públicas y se sustituirá en fase 3.

## Base de datos y dominio

- `apps/api/src/db/esquema.ts` fue reconstruido desde frontend, no introspectado. Decisiones en `docs/migracion-bd.md`.
- `npm run db:generate -- --name=descripcion`: versionar SQL y metadatos de `apps/api/drizzle`. `npm run db:migrate` usa DATABASE_URL e historial Drizzle; no combinar SQL manual y migrador, ni usar drizzle-kit push.
- `npm run db:verify`: versión/tablas/RLS, transacción de solo lectura y sin credenciales en salida.
- Tablas exactas: `clientes`, `tecnicos`, `vehiculos`, `gps`, `simcards`, `instalaciones`, `gps_asignaciones`, `simcard_asignaciones`, `vehiculo_imagenes`.
- Plan Anual y Plan Anual (monitoreo) son equivalentes; Plan Anual (Sin monit.) es distinto. America/Santo_Domingo; moneda DOP (RD$).
- Excel real y `backups/` ignorados; único fixture permitido: `tests/fixtures/excel-muestra.xlsx` anonimizado.
- Skills oficiales en `.agents/skills` registradas por `opencode.json`. Arquitectura/migraciones Drizzle prevalecen sobre ejemplos Supabase Auth/CLI.
- Comentarios y UI nuevos en español. Toasts react-hot-toast (proveedor en app), iconos lucide-react. Tipos heredados compartidos en `apps/web/src/types.ts`.
