# Easyway GPS Gestión

Monorepo npm para gestionar clientes, vehículos, inventario e instalaciones GPS.
**Seguimiento por fase y tarea: [PROGRESO.md](PROGRESO.md).**

## Desarrollo

Node 22 y npm. Desde la raíz:

```sh
npm ci
npm run dev
```

La web Next.js App Router arranca en http://localhost:3000.

| Directorio | Estado |
| --- | --- |
| `apps/web` | Next.js; rutas en `src/app`, pantallas migradas en `src/pantallas` |
| `apps/api` | Esquema Drizzle y validación; servidor Hono previsto para fase 3 |
| `packages/shared` | Zod y normalizadores de texto, teléfono, correo y nombres |
| `scripts/db` | Migraciones, inspección de Supabase e integración PostgreSQL |

## Configuración y transición

Usar `.env.example` como referencia sin sobrescribir el `.env` privado existente.
Las herramientas de BD y Next cargan también el `.env` raíz sin sustituir variables
ya presentes en el entorno. Solo las dos variables explícitas `NEXT_PUBLIC_SUPABASE_*`
se incorporan a la web; `DATABASE_URL` y `SUPABASE_SECRET_KEY` son exclusivamente privadas.

La nueva BD tiene RLS sin políticas públicas. El CRUD actual todavía depende del
cliente antiguo de Supabase y se migrará a Hono en la fase 3. Sin configuración
pública, las rutas muestran un aviso de conexión pendiente y permiten navegar.
No introducir claves privadas como variables públicas ni abrir RLS para sortear
esta transición. Las pruebas de las pantallas usan un cliente simulado.

El bucket `vehicles` es privado y se verificaron autenticación/listado con la API
de Supabase Storage. El adaptador de fotos, enlaces temporales y pruebas de
subida/descarga/borrado pertenecen a la fase 3. No usamos credenciales S3.

## Verificación

| Comando | Qué ejecuta |
| --- | --- |
| `npm run lint` | oxlint en código de aplicación y herramientas |
| `npm run typecheck` | tipos de todos los workspaces, generación de rutas Next y herramientas BD |
| `npm run test:unit` | guardas de commits y Vitest web/API/shared; sin red ni Docker |
| `npm run test:int` | PostgreSQL 16 efímero; requiere Docker activo, nunca usa DATABASE_URL |
| `npm test` | unitarias + integración |
| `npm run test:e2e` | Chromium, servidor Next aislado en puerto 3100, sin acceso a producción |
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
- `npx tsx scripts/db/verificar-storage.ts`: metadatos del bucket privado.

Ver [docs/migracion-bd.md](docs/migracion-bd.md). Las migraciones 0000/0001 están
aplicadas en Supabase PostgreSQL 17.11. El Excel real no está importado ni versionado;
su importador transaccional se construirá en la fase 6.

Skills oficiales Supabase en `.agents/skills`, registradas mediante `opencode.json`.
