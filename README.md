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

Fase 1: esquema inicial y pruebas locales preparados. Pendiente configurar y aplicar
la migración en el proyecto Supabase del usuario, y verificar allí la disponibilidad
gratuita de Storage/S3. No se ha accedido a servicios remotos.
