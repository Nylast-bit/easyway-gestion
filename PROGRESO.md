# Progreso — Easyway GPS Gestión

**Estado: fase 3 implementada y migrada en Supabase; dominio de correo verificado. Para cerrarla: administrador real y pruebas manuales.**
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
- [x] Hono, contratos/validación Zod y configuración del backend (autenticación; contratos CRUD en el bloque 2).
- [x] Migrar usuarios/sesiones; login, bloqueo temporal, roles y seed admin.
- [x] Verificación de correo por OTP (Resend, plantilla HTML con colores de la marca); cuentas solo con usuario sin OTP.
- [x] Aplicar `0002_autenticacion` y `0003_autor_imagenes` en Supabase (historial verificado: 0000–0003).
- [x] Gestión de cuentas: seed interactivo del primer admin y pantalla Usuarios (alta, edición, activación, contraseña).
- [ ] Crear el administrador real (`npm run db:crear-admin`, lo ejecuta el usuario).
- [x] Verificar el dominio remitente `easywagps.com` en Resend (DKIM y registros de envío verificados).
- [ ] Pruebas manuales del usuario en la plataforma.
- [x] Migrar CRUD, búsquedas y asignaciones a API con transacciones.
- [x] Portal protegido y retirada de Supabase del frontend (fotos deshabilitadas hasta el adaptador de Storage).
- [x] Adaptador Supabase Storage con autorización y URLs temporales; probar archivos.
- [x] Pruebas de autorización, aislamiento entre técnicos y rollback.
- [ ] Verificaciones, documentación y commit.

### Evidencia de fase 3 — bloque 1
- 41 pruebas rápidas: 2 guardas, 9 API, 12 web y 20 shared (entre ellas contratos de login y plantilla OTP).
- 10 pruebas de integración con PostgreSQL 16 efímero: login por usuario, bloqueo 15 min, OTP con
  reenvío/espera/agotamiento/caducidad, fallo del proveedor de correo, sesión caducada, roles y CSRF por JSON.
- Prueba de humo del proceso real: migración, seed admin, login 202 → OTP → cookie HttpOnly → crear usuario.
- 3 escenarios Playwright: redirección sin sesión, login con OTP → ruta solicitada y navegación de las siete rutas.
- Build Next con `/login` y proxy de sesión; lint sin errores (cuatro advertencias heredadas).

### Evidencia de fase 3 — bloque 2
- 58 pruebas rápidas: 2 guardas, 9 API, 16 web (CRUD contra API simulada) y 24 shared (contratos de entidades).
- 17 pruebas de integración: 7 nuevas de gestión con PostgreSQL 16 efímero (401/403 en todas las rutas, CRUD y
  normalización, asignación/cambio/retirada de GPS y SIM, rollback completo ante equipo no disponible,
  3 peticiones simultáneas por el mismo GPS → una 201 y dos 409, historial, resumen y búsqueda con comodines escapados).
- 3 escenarios Playwright con API simulada y Supabase bloqueado.
- Humo con pila real (PostgreSQL efímero + API + Next): login, alta encadenada cliente → SIM → GPS → vehículo, 409 al reutilizar el GPS y pantallas mostrando los datos.
- Lint sin errores ni advertencias; build Next correcto; `@supabase/supabase-js` retirado de la web.

### Evidencia de fase 3 — bloque 3
- Prueba real contra el bucket privado `vehicles` (`npm run storage:verificar`): subida, no sobrescritura,
  descarga con URL firmada, URL pública rechazada, borrado y URL firmada inservible tras borrar.
- 22 pruebas de integración: 5 nuevas de aislamiento y fotos (técnicos solo ven/actualizan lo suyo, 403 en
  administración, URL temporal que caduca y no se puede alterar, 7 subidas simultáneas → 5 aceptadas,
  formato por firma, 8 MB, mismo origen, borrado solo de fotos propias, rollback si Storage falla al borrar,
  borrado de vehículo con sus fotos).
- 66 pruebas rápidas: 2 guardas, 14 API (almacén local y adaptador Supabase simulado), 19 web (menú por rol,
  avance de técnico, galería multipart) y 24 shared.
- Build y lint correctos.

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
