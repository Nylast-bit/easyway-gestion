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
- Revisión visual obligatoria al tocar pantallas, formularios, layout o CSS: `npm run test:capturas` (proyecto Playwright `capturas`, `e2e/capturas.spec.ts`) captura cada pantalla, panel y modal en móvil 390×844, tablet 820×1180, laptop 1366×768 y PC 1920×1080 en `capturas/<tamaño>/` (ignorado por Git). Falla ante desborde horizontal, texto recortado por `overflow` oculto, contenido que se sale de su tarjeta o errores de página. Además, abrir las imágenes y revisarlas (alineación, columnas aplastadas, botones fuera de lugar); el chequeo automático no ve todo. Pantallas nuevas: añadirlas al spec con datos simulados de textos largos. No corre en `test:e2e` ni en el hook; no reutiliza un `next dev` abierto.
- Pre-commit: lint-staged bloquea secretos/datos, lint de staged, tipos y tests relacionados rápidos; cambios globales/shared verifican todos los workspaces. No ejecutar Docker/e2e dentro del hook.
- Al cerrar fase: lint, typecheck, test, build y e2e pertinentes; actualizar README/PROGRESO y commit Conventional Commits.

## Variables y acceso

- `.env` raíz se carga sin sobrescribir el entorno por scripts de BD y `apps/web/next.config.ts`. Next también admite su `.env` de workspace.
- La web no usa Supabase ni variables `NEXT_PUBLIC_*`: todo dato pasa por `solicitarApi` (`apps/web/src/lib/api.ts`) hacia `/api`. Las pruebas web simulan `fetch` por ruta (`src/tests/preparacion.ts`).
- Permisos por prefijo en `apps/api/src/app.ts` (`proteger`): toda ruta nueva se declara ahí. Solo admin: `usuarios`, `resumen`, `buscar`, `clientes`, `tecnicos`, `vehiculos`, `gps`, `simcards`. Admin y técnico: `instalaciones`, `fotos`, `tipos-servicio`, `campo` (solo técnicos con ficha). Admin también: `aprobaciones`, `costos-tecnicos`, `importaciones`.
- Aislamiento de técnicos (`negocio/acceso.ts`): cuenta técnica sin `tecnico_id` → 403; ve solo instalaciones con su `tecnico_id` (ajenas → 404) y solo cambia su avance (`PATCH /instalaciones/:id/avance`); fotos solo de vehículos donde tiene instalación y borra solo las que subió (`subida_por`). La web oculta al técnico todo salvo `/installations` (`RUTAS_TECNICO` en `lib/sesion.tsx`).
- Asignaciones GPS↔vehículo y SIM↔GPS solo en `apps/api/src/negocio/asignaciones.ts`, dentro de transacción con `FOR UPDATE`; cambian estados (`Instalado`/`Asignada`/`Disponible`) y cierran historial con `fecha_fin`, nunca lo borran. Errores PostgreSQL se traducen en `http/erroresBd.ts`.
- RLS sin políticas públicas es intencional: el backend usa el rol propietario; no abrir permisos anon.
- Archivos: interfaz `AlmacenArchivos` (`apps/api/src/almacen`). Con `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (clave secreta, nunca publicable ni `NEXT_PUBLIC_`) usa el bucket privado `vehicles`; sin ellas, en desarrollo usa `.almacen-local/` con enlaces HMAC servidos por `/api/archivos/:token`. Producción exige Supabase. URLs firmadas de 10 min; nunca guardar URLs, solo `storage_path` (`vehiculos/<id>/<uuid>.<ext>`). Formato validado por firma de bytes (JPG/PNG/WebP), máx. 8 MB y 5 fotos por vehículo (bloqueo `FOR UPDATE`). `npm run storage:verificar` prueba el bucket real con un objeto desechable en `pruebas/`.

## Autenticación

- Sesiones propias: cookie httpOnly `easyway_sesion` (SameSite Lax, Secure en producción), 12 h; en BD solo SHA-256 del token. Contraseñas scrypt (node:crypto).
- Login por usuario o correo (`clasificarIdentificador` en shared). Toda cuenta con correo sin verificar recibe OTP de 6 dígitos por Resend (10 min, 5 intentos, reenvío cada 60 s, máx. 5) y se verifica una sola vez; cuentas solo con usuario no tienen OTP.
- 5 contraseñas fallidas bloquean 15 min. Mutaciones solo aceptan JSON (defensa CSRF junto a SameSite). Roles `admin`/`tecnico`: `requerirSesion` + `requerirRol`.
- Sin `RESEND_API_KEY`/`CORREO_REMITENTE` en desarrollo el OTP se imprime en la consola de la API; en producción son obligatorias. Plantilla HTML en `apps/api/src/correo/plantillaOtp.ts` (paleta #00b494).
- Primer admin: `npm run db:crear-admin` (interactivo con contraseña oculta, o `ADMIN_*` en el entorno; idempotente). El resto de cuentas en `/users` (pantalla Usuarios, admin). Un admin no puede desactivarse ni quitarse el rol; desactivar, cambiar rol/ficha o restablecer contraseña borra las sesiones de esa cuenta.
- `npm run dev` de la API usa `node --watch --import tsx` (no `tsx watch`, que en Windows se quedaba sin escuchar).

## Cobros y vencimientos (fase 5)

- Cobros = a clientes. `servicios`: plan por vehículo (uno activo por vehículo) con `proximo_cobro`; `POST /cargos/generar` crea un cargo por periodo (índice único servicio+periodo: idempotente y seguro en paralelo).
- Pagos se reparten en `pago_aplicaciones` (por defecto a los cargos más antiguos; sobrante = saldo a favor). Saldos e importes en céntimos enteros en código y `numeric(12,2)` en BD; bloqueo `FOR UPDATE` de cargos en orden de id.
- Nada se borra: cargos y pagos se anulan con motivo; un cargo con pagos vigentes no se anula. Facturas/NCF solo como referencia (`referencia_factura`).
- Vigencias: asignar GPS a vehículo fija `gps.fecha_vencimiento` a 1 año; SIM a 1 año si no tenía fecha. Editables (`PUT /vencimientos/gps|simcard/:id`).
- `registrarAuditoria(tx, …)` dentro de la misma transacción en toda acción sensible. Fechas de negocio con `fechaEnRD`/`sumarMeses` de shared.

## Importación del Excel (fase 6)

- Flujo: `POST /api/importaciones` (multipart, ≤10 MB) analiza sin escribir datos de negocio y guarda filas normalizadas en staging; `/previsualizar` recalcula con decisiones de catálogo; `/confirmar` ejecuta en una transacción; `/descartar` y `/revertir`. El archivo no se guarda.
- Lector `apps/api/src/importacion/analizar.ts` (columnas por título; hoja "Data de instalaciones e cliente", "Simcards" solo fechas, "Listado de Clientes" solo tipo Empresa). Planificador puro `planificar.ts`: cada fila es un evento cronológico sobre su GPS/SIM; omite filas con IMEI ya existente; planes de cobro solo con plan activo y desde la próxima renovación. Ejecutor `aplicar.ts` con inserciones por lotes y registro de lo creado.
- Idempotencia por hash del archivo (índice único parcial). Revertir borra solo lo registrado; si algo posterior lo usa, la FK revierte todo (409).
- Fixture: `tests/fixtures/excel-muestra.xlsx` generado con `npx tsx scripts/crear-fixture-excel.ts` (datos inventados, mismas rarezas). El Excel real nunca se versiona ni se imprime: los análisis solo muestran conteos.

## Técnicos, aprobación y costos (fase 7)

- `POST /campo/trabajos`: el técnico registra un trabajo (cliente/vehículo existentes o propuestos) que queda `aprobacion = 'Pendiente'` con `propuesta`; no toca inventario ni asignaciones. Técnicos solo buscan clientes por nombre (`/campo/clientes`, id+nombre).
- `POST /aprobaciones/:id/aprobar` (una transacción): une con cliente/vehículo existente si el admin lo indica o los crea, crea o reutiliza GPS/SIM por número y aplica el efecto del tipo (`efectoDe` en `negocio/aprobaciones.ts`: instalación/reinstalación/venta/cambio de equipo asignan; desinstalación/retiro retira; cambio de SIM solo SIM; el resto nada). Fija `costo_tecnico`; plan de cobro opcional.
- Costos: `/costos-tecnicos` lista y resume; `/pagar` es todo-o-nada; `/desmarcar` exige motivo y queda auditado; el costo no se cambia si ya está pagado.
- Web: técnico entra a `/field` (Trabajo de campo) y `/installations` (`RUTAS_TECNICO`); admin `/approvals` y `/technician-costs`.
- Filtros de instalaciones: `GET /instalaciones` y `/instalaciones/resumen` aceptan `desde`/`hasta` (fechas RD, -04:00), `tecnico` (id o `sin`), `tipo_servicio_id`, `estado` (`esquemaFiltroInstalaciones`); para un técnico se ignora `tecnico` y siempre se aplica su alcance. Periodos relativos con `rangoPeriodo` de shared. Usuarios muestra "Técnicos sin cuenta" con atajo de alta ligado a la ficha.

## Base de datos y dominio

- `apps/api/src/db/esquema.ts` fue reconstruido desde frontend, no introspectado. Decisiones en `docs/migracion-bd.md`.
- `npm run db:generate -- --name=descripcion`: versionar SQL y metadatos de `apps/api/drizzle`. `npm run db:migrate` usa DATABASE_URL e historial Drizzle; no combinar SQL manual y migrador, ni usar drizzle-kit push.
- `npm run db:verify`: versión/tablas/RLS, transacción de solo lectura y sin credenciales en salida.
- Tablas exactas: `clientes`, `tecnicos`, `vehiculos`, `gps`, `simcards`, `instalaciones`, `gps_asignaciones`, `simcard_asignaciones`, `vehiculo_imagenes` (con `subida_por`), `usuarios`, `sesiones`, `verificaciones_correo`, `tipos_servicio`, `planes`, `servicios`, `cargos`, `pagos`, `pago_aplicaciones`, `auditoria`, `importaciones`, `importacion_filas`, `importacion_registros`.
- Plan vigente: "Plan Anual" RD$5,500 (sembrado en 0004). Plan Anual y Plan Anual (monitoreo) son equivalentes; Plan Anual (Sin monit.) es distinto. America/Santo_Domingo; moneda DOP (RD$).
- Instalaciones usan `tipo_servicio_id` (catálogo `tipos_servicio`); `aprobacion` (Pendiente/Aprobada/Rechazada), `propuesta` y costo del técnico preparan la fase 7.
- Excel real y `backups/` ignorados; único fixture permitido: `tests/fixtures/excel-muestra.xlsx` anonimizado.
- Skills oficiales en `.agents/skills` registradas por `opencode.json`. Arquitectura/migraciones Drizzle prevalecen sobre ejemplos Supabase Auth/CLI.
- Comentarios y UI nuevos en español. Toasts react-hot-toast (proveedor en app), iconos lucide-react. Contratos Zod y tipos de respuesta de la API en `packages/shared/src/entidades.ts` (la web los importa de `@easyway/shared`).
