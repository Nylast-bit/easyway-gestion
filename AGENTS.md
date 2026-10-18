# AGENTS.md

SPA Vite + React 19 + TypeScript aún en la raíz. `apps/api/` contiene el esquema y migraciones, no un backend ejecutable. Fase 2 acordada: npm workspaces y Next.js App Router en `apps/web`, manteniendo Hono separado en `apps/api`.

## Comandos (npm)

- `npm run lint` — oxlint (NO eslint; configuración en `.oxlintrc.json`)
- `npm run build` — `tsc -b && vite build`. Este es el gate de typecheck y lo que Vercel ejecuta en el deploy; un commit reciente existió solo porque errores de TS bloqueaban el build en Vercel. Ejecútalo antes de dar el trabajo por terminado.
- `npm run dev` — servidor de desarrollo
- `npm run typecheck` verifica la SPA y las herramientas de BD (`tsconfig.db.json`).
- `npm test` ejecuta Vitest contra PostgreSQL 16 efímero en Docker: requiere motor activo, no usa DATABASE_URL y elimina su contenedor. Una prueba: `npm test -- -t "RLS"`.
- Node objetivo: 22. Comprobar lint, typecheck, test y build antes del commit de cada fase.

Usa **npm** únicamente. `package-lock.json` es el lockfile vigente en el repo; `pnpm-lock.yaml` es un residuo antiguo de julio 2026 — ignóralo (y no lo elimines sin preguntar).

## Entorno

- El cliente de Supabase (`src/lib/supabaseClient.ts`) requiere `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env` (gitignored). La app falla al iniciar sin ellas; no hay fallbacks ni init diferido.

## Arquitectura

- Las rutas se definen centralmente en `src/App.tsx` dentro de `MainLayout` (`src/layouts/MainLayout.tsx`, que también posee el sidebar — agregar una ruta implica actualizar ambos).
- Cada página en `src/pages/` posee su propio CRUD directo contra Supabase (select/insert/update/delete en línea en la página). Los componentes de formulario compartidos están en `src/components/`.
- Los tipos de filas compartidos están en `src/types.ts`.

## Nombres de tablas Supabase (en español — deben coincidir exactamente)

`clientes`, `tecnicos`, `vehiculos`, `gps`, `simcards`, `instalaciones`, `gps_asignaciones`, `simcard_asignaciones`, `vehiculo_imagenes`

Esquema reconstruido desde el frontend en `apps/api/src/db/esquema.ts`; no es un dump de la BD antigua. Decisiones y preparación del destino en `docs/migracion-bd.md`.

- `npm run db:generate -- --name=descripcion` genera SQL y metadatos en `apps/api/drizzle`; versionar ambos.
- `npm run db:migrate` carga `.env` raíz sin sobrescribir el entorno; requiere DATABASE_URL. Usa el historial Drizzle, no aplicar SQL manual y luego intentar migrarlo otra vez. `npm run db:verify` inspecciona versión, tablas y RLS con una transacción de solo lectura, sin mostrar credenciales.
- RLS sin políticas públicas es intencional: la SPA antigua no podrá usar la nueva BD con anon key; el backend llegará en fase 3. No abrir permisos públicos para evitarlo.
- No usar `drizzle-kit push` en el destino. Cambios de esquema posteriores van en migraciones nuevas.
- El Excel real y `backups/` están ignorados; solo se permite el futuro fixture anonimizado `tests/fixtures/excel-muestra.xlsx`.
- Plan Anual y Plan Anual (monitoreo) son equivalentes, confirmado; Plan Anual (Sin monit.) es distinto.
- Storage/S3 de Supabase pendiente de configuración y confirmación de cuota gratuita; secretos solo en backend. Zona horaria: America/Santo_Domingo; moneda DOP (RD$).
- Skills oficiales en `.agents/skills`, registradas mediante `opencode.json`; revisar las guías aplicables a PostgreSQL/Storage. La arquitectura y migraciones Drizzle del proyecto prevalecen sobre ejemplos de Supabase Auth o CLI.

## Convenciones

- Comentarios de código, textos de UI e identificadores están en español — mantén la consistencia en código nuevo.
- `tsconfig.app.json` habilita `noUnusedLocals` y `noUnusedParameters`: imports/variables sin usar fallan `npm run build` aunque el lint pase.
- Toasts con `react-hot-toast` (`Toaster` montado en `App.tsx`); iconos con `lucide-react`.
