# Progreso — Easyway GPS Gestión

**Estado: fase 2 completada. Próxima: fase 3 — API, autenticación y transacciones (sin iniciar).**
Las casillas se marcan únicamente cuando la tarea o verificación esté terminada.

## Fase 1 — Base inicial y Supabase
- [x] Reconstruir las nueve tablas desde el frontend y documentar decisiones.
- [x] Versionar migraciones Drizzle y probarlas en PostgreSQL 16 efímero.
- [x] Aplicar migraciones en Supabase y verificar tablas/RLS.
- [x] Instalar skills oficiales y registrar instrucciones en OpenCode.
- [x] Verificar autenticación/listado por API y bucket privado `vehicles`.
- [x] Excluir Excel real, secretos y respaldos de Git.
- [x] Ejecutar lint, typecheck, pruebas y build; registrar commits.
- La subida/descarga/borrado de fotos se probará con el adaptador en fase 3.

## Fase 2 — Next.js, monorepo y calidad
- [x] Crear este seguimiento persistente.
- [x] Crear npm workspaces `apps/web`, `apps/api` y `packages/shared`.
- [x] Migrar páginas, navegación y estilos a Next.js App Router.
- [x] Separar variables públicas y privadas; conservar Hono como backend futuro.
- [x] Añadir normalizadores compartidos con pruebas unitarias.
- [x] Configurar Vitest en web/API y Testing Library con smoke tests de las siete páginas.
- [x] Configurar Playwright y verificar navegación de la web sin acceder a producción.
- [x] Configurar husky/lint-staged: lint, tipos del workspace afectado y tests relacionados rápidos.
- [x] Bloquear secretos, respaldos y Excel real en commits.
- [x] Ejecutar lint, typecheck, unitarias, integración, e2e y build.
- [x] Actualizar README/AGENTS y hacer commit de fase 2 (`4248509`).

### Evidencia de fase 2
- 31 pruebas rápidas: 2 guardas de commits, 4 API, 8 web y 17 shared.
- 3 pruebas de integración sobre PostgreSQL 16 efímero.
- 1 escenario Playwright: siete rutas, navegación, recarga y ausencia de errores de página.
- Build Next.js 16.4.2 verificado también con Node 22.22.0.
- lint-staged ejecutado sobre los cambios reales; no ejecuta Docker ni Playwright.
- Lint termina sin errores; quedan cuatro advertencias de variables sin uso heredadas.
- La interfaz muestra conexión pendiente sin variables públicas; CRUD/API propios llegan en fase 3.

## Fase 3 — API, autenticación y transacciones
- [ ] Hono, contratos/validación Zod y configuración del backend.
- [ ] Migrar usuarios/sesiones; login, bloqueo temporal, roles y seed admin.
- [ ] Migrar CRUD, búsquedas y asignaciones a API con transacciones.
- [ ] Portal protegido y retirada de Supabase del frontend.
- [ ] Adaptador Supabase Storage con autorización y URLs temporales; probar archivos.
- [ ] Pruebas de autorización, aislamiento entre técnicos y rollback.
- [ ] Verificaciones, documentación y commit.

## Fase 4 — Docker
- [ ] Imágenes multi-stage de Next.js/API y compose de desarrollo/producción.
- [ ] PostgreSQL, almacenamiento portable y respaldos con retención.
- [ ] Configuración validada, healthchecks y prueba de restauración.
- [ ] Verificaciones, documentación y commit.

## Fase 5 — Modelo ampliado
- [ ] Clientes, vehículos, SIM, planes y tipos de servicio.
- [ ] Tarifas, aprobación, pagos y auditoría.
- [ ] Migraciones/seed y restricciones verificadas.
- [ ] Verificaciones, documentación y commit.

## Fase 6 — Importación Excel
- [ ] Fixture anonimizado y normalizadores completos.
- [ ] Análisis/staging, vista previa, alias y advertencias por fila.
- [ ] Confirmación transaccional, idempotencia, reporte y reversión segura.
- [ ] Pruebas de conteos, duplicados y rollback.
- [ ] Verificaciones, documentación y commit.

## Fase 7 — Técnicos y pagos
- [ ] Portal móvil, nueva instalación, fotos e historial propio.
- [ ] Aprobación admin y asignaciones atómicas.
- [ ] Pagos, reportes, usuarios y auditoría de reversiones.
- [ ] E2e técnico → aprobación → pago.
- [ ] Verificaciones, documentación y commit.

## Fase 8 — Extras y CI completo
- [ ] Dashboard, stock mínimo y vencimientos.
- [ ] Historial de vehículo/GPS/SIM.
- [ ] Baja lógica y exportaciones Excel.
- [ ] GitHub Actions con cobertura, integración, e2e y builds Docker.
- [ ] Protección de main (requiere permisos del repositorio).
- [ ] Verificaciones, documentación y commit.
