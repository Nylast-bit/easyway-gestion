# Easyway GPS Gestión

Aplicación React + Vite para gestionar clientes, vehículos, equipos e instalaciones.
La evolución a backend propio se realiza por fases. La SPA actual sigue en `src/`;
`apps/api/src/db/` contiene únicamente el esquema inicial, no un servidor todavía.

## Desarrollo

Usar npm y Node 22. Instalar con `npm ci`.

- `npm run dev`: SPA existente (requiere las variables Vite de Supabase).
- `npm run lint`: oxlint.
- `npm run typecheck`: tipos de la SPA y herramientas de base de datos.
- `npm test`: integración de la migración en PostgreSQL 16 real; requiere Docker activo.
  Crea un contenedor efímero con puerto local aleatorio y lo elimina al terminar.
- `npm run build`: compilación de la SPA.
- `npm run db:generate -- --name=descripcion`: generar una migración después de cambiar el esquema.
- `npm run db:migrate`: aplicar migraciones pendientes usando `DATABASE_URL`.
- `npm run db:verify`: consultar versión, tablas y RLS sin modificar datos.
  Ambos comandos cargan `.env` raíz sin imprimir la conexión.

## Base de datos inicial

Ver [docs/migracion-bd.md](docs/migracion-bd.md) para crear el proyecto vacío,
aplicar el SQL y preparar Storage. El esquema se reconstruyó desde consultas y
formularios: no es una exportación de la base anterior.

La migración habilita RLS sin políticas públicas. **La SPA antigua no puede hacer
CRUD con la anon key sobre esta base nueva**: se conectará mediante el backend en
la fase 3. No abrir permisos públicos para sortear esta transición.

El Excel real y `backups/` están excluidos de Git. El histórico se importará en la
fase 6 con análisis, vista previa y confirmación; todavía no se ha importado.

## Estado

Fase 1: migraciones 0000 y 0001 aplicadas en Supabase (PostgreSQL 17.11), nueve
tablas verificadas con RLS habilitado. Pruebas locales aprobadas en PostgreSQL 16.
Pendiente configurar las credenciales S3 y verificar el bucket privado `vehiculos`.
El plan Free publicado incluye 1 GB de archivos; confirmar el plan de la organización.

Fase 2 acordada: migrar a Next.js App Router en `apps/web` y npm workspaces,
conservar backend Hono separado y validación compartida. La web requerirá servidor
Node, no solo nginx estático. Esta migración aún no está implementada.

Skills oficiales Supabase instaladas en `.agents/skills`; reiniciar OpenCode para
que descubra las skills registradas en `opencode.json`.
