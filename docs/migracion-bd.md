# Base de datos inicial — fase 1

## Alcance y decisiones

El proyecto antiguo no está accesible y no hay datos que conservar. Las nueve
tablas se reconstruyeron desde los tipos, páginas y formularios (ahora en
`apps/web/src/types.ts`, `apps/web/src/pantallas` y `apps/web/src/components`). La fuente
versionada es `apps/api/src/db/esquema.ts`; Drizzle genera
`apps/api/drizzle/0000_inicial.sql` y sus metadatos. No se hizo introspección.

| Entidad | Evidencia |
| --- | --- |
| clientes / tecnicos | tipos, EntityForm y páginas de CRUD |
| vehiculos | VehicleForm, Vehicles, tipos y relaciones con clientes |
| gps / simcards | tipos, formularios, páginas y estados utilizados |
| instalaciones | InstallationForm y select con relaciones en Installations |
| gps_asignaciones / simcard_asignaciones | consultas, inserciones y cierre con fecha_fin en Vehicles y Gps |
| vehiculo_imagenes | Vehicles y VehicleForm: vehiculo_id y storage_path |

Decisiones nuevas, no atributos recuperados de la base anterior:

- IDs integer con identidad; claves foráneas restrictivas (no borrar historial en cascada).
- Fechas de eventos `timestamptz`; compra/vencimiento de SIM como `date`.
  La futura UI interpretará fechas locales en `America/Santo_Domingo`.
- Técnico y fecha de instalación permiten null para históricos incompletos del Excel.
  El importador deberá advertirlo; no inventar fechas ni técnicos.
- IMEI único de 15 dígitos; número SIM único. Normalización de teléfonos/ICCID en la fase de importación.
- Un índice parcial impide dos asignaciones activas para el mismo GPS o SIM.
  No se impone todavía una sola SIM por GPS ni un solo GPS por vehículo.
- Cerrar una asignación antes de su inicio falla. No hay triggers de actualización
  de inventario: las transacciones de negocio se implementan en la fase 3.
- Contacto y descripción del vehículo permiten información incompleta; nombre del
  cliente/técnico y referencias de vehículo/GPS de una instalación son obligatorios.
- RLS habilitado sin políticas: deniega acceso a roles públicos, sin usar `auth.uid()`
  ni depender de esquemas `auth` o `storage`. El propietario de las tablas puede operar;
  el backend tendrá credenciales privadas y autorización propia.
- Usuarios, sesiones, planes, tarifas, pagos, auditoría y staging se añadirán en
  sus fases. `Plan Anual` y `Plan Anual (monitoreo)` son el mismo plan, confirmado
  por el usuario; `Plan Anual (Sin monit.)` es otro.

## 1. Verificar localmente

Con Node 22, npm y Docker activo:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas crean PostgreSQL 16 en un contenedor descartable y no leen DATABASE_URL.
Verifican creación, repetición segura de migraciones, relaciones, unicidad,
historial de asignaciones y denegación de lectura/escritura a un rol público.
No verifican todavía el servicio Supabase ni Storage.

## 2. Crear y conectar Supabase

1. Crear un proyecto vacío en la cuenta del usuario y guardar su contraseña fuera de Git.
2. Obtener la conexión PostgreSQL directa desde el panel Connect. No usar el pooler
   en modo transacción para migraciones. Si la red no soporta la conexión directa,
   usar el pooler en modo sesión (puerto 5432), compatible con migraciones.
3. Configurar `DATABASE_URL` en el entorno del proceso o `.env` raíz (no pegarla en chats o commits).
   Usar TLS según las instrucciones del proveedor; no desactivar validación de certificados.
4. Ejecutar desde la raíz `npm run db:migrate`. El comando requiere la variable y
   mantiene el registro de migraciones en `drizzle.__drizzle_migrations`.
5. Comprobar en el panel las nueve tablas y que RLS esté habilitado.

El SQL solicitado está en `apps/api/drizzle/0000_inicial.sql`. Preferir el comando
de migración: ejecutarlo manualmente en SQL Editor no registra el historial de
Drizzle. No mezclar ambos procedimientos sobre la misma base ni volver a ejecutar
el SQL inicial sobre tablas existentes.

No ejecutar `drizzle-kit push` en el destino. Cada cambio posterior genera una nueva
migración revisada. La inicial se aplica solo a una base vacía. Para descartar una
prueba, eliminar únicamente el contenedor efímero; no se incluye un rollback que
borre tablas con datos. Cambios posteriores tendrán su estrategia de reversión
documentada antes de aplicarse.

## 3. Preparar fotos con Supabase Storage (decisión actual)

El usuario eligió la API de Supabase Storage, sin interfaz ni credenciales S3.
El bucket `vehicles` ya existe y se verificó que es privado mediante consulta de
solo lectura a `storage.buckets`. No modificar metadatos de Storage mediante SQL.
El plan Free publicado incluye 1 GB; el consumo y plan de la cuenta se revisan en el panel.

Una vez confirmado:

1. Mantener privado el bucket `vehicles` en Storage.
2. Obtener la URL del proyecto y una clave secreta de servidor desde el panel.
3. Guardarlas únicamente como variables del futuro backend:
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET=vehicles`.
4. En la fase 3 probar subida, descarga autorizada y borrado de un objeto de prueba.
   La clave del objeto coincidirá con `vehiculo_imagenes.storage_path`.

La SPA actual usa URLs públicas y el SDK de Supabase; ese flujo se sustituirá por
la API y enlaces temporales. No hacer público el bucket para mantener el flujo antiguo.
El adaptador usará el SDK/API de Storage solo en backend. La interfaz de archivos
mantendrá aislado al proveedor para una futura implementación MinIO. El código
antiguo aún referencia `vehiculos`; no basta cambiar ese nombre para habilitar el
flujo privado, pues también necesita autorización y URLs temporales en fase 3.

## Próximas fases

La fase 2 migra la SPA a Next.js App Router en `apps/web` y npm workspaces, conservando
Hono como backend separado para la fase 3. Las herramientas de BD siguen en raíz,
con esquema/migraciones en `apps/api` y validación compartida en `packages/shared`.
Antes de cargar datos reales se incorporarán respaldo/restauración. No se necesita
copiar Storage ni respaldar una base antigua inexistente. El Excel se carga en fase 6.

## Fase 3 — autenticación (0002_autenticacion)

Añade `usuarios`, `sesiones` y `verificaciones_correo`, todas con RLS sin políticas.

- Una cuenta tiene `usuario` y/o `correo` (único, en minúsculas). Con correo, debe
  verificarlo una vez (`correo_verificado_at`) mediante OTP antes de tener sesión.
- `tecnico_id` opcional y único enlaza la cuenta con la ficha de `tecnicos`; solo rol `tecnico`.
- Contraseñas scrypt; tokens de sesión y desafíos OTP se guardan como SHA-256.
- Borrar un usuario borra en cascada sus sesiones y verificaciones; no afecta a datos de negocio.
- Es aditiva: no modifica tablas existentes. Aplicar con `npm run db:migrate` y crear el
  administrador con `npm run db:crear-admin`.

## Fase 3 — autor de fotos (0003_autor_imagenes)

Añade `vehiculo_imagenes.subida_por` (opcional, `ON DELETE SET NULL` hacia `usuarios`).
Permite que un técnico borre solo sus fotos y conserva la foto si se elimina la cuenta.
Aditiva; las filas existentes quedan con autor nulo (solo un admin podrá borrarlas).

## Fase 5 — modelo ampliado (0004_modelo_ampliado, 0005_retirar_tipo_texto)

- Nuevas tablas: `tipos_servicio`, `planes`, `servicios`, `cargos`, `pagos`, `pago_aplicaciones`, `auditoria` (RLS, sin políticas).
- `clientes`: `tipo` (Particular/Empresa), `documento`, `notas`. `vehiculos`: `tipo` (Carro/Motor/Camión/Otro).
  `gps`: `fecha_vencimiento`.
- `instalaciones`: `tipo` (texto) pasa a `tipo_servicio_id`. La 0004 está **editada a mano** para no perder
  datos: añade la columna nula, siembra el catálogo, crea tipos para textos existentes no reconocidos
  (agrupando mayúsculas/espacios), mapea y después la hace obligatoria; la 0005 elimina el texto.
  Probado en `scripts/db/migracion-0004.test.ts` partiendo de una base en 0003 con datos.
- `vehiculo_id` y `gps_id` de instalaciones admiten null salvo si la instalación está `Aprobada` (check);
  las existentes quedan aprobadas. Campos de aprobación, propuesta y costo del técnico para la fase 7.
- Siembra `Plan Anual` (Anual, RD$5,500). Cargos/pagos se anulan con motivo (checks); un servicio solo
  puede facturar una vez cada periodo (índice único parcial).

## Verificación del destino

Se comprobó primero que `public` no tenía tablas. Después se aplicaron `0000_inicial`
y `0001_indices_historial` mediante Drizzle y se verificaron las nueve tablas con
RLS habilitado y cero políticas públicas en PostgreSQL 17.11. No se importaron datos.
La segunda migración añade índices completos para consultar el historial de GPS/SIM;
los índices parciales existentes solo cubren asignaciones activas.

En la fase 3 se aplicaron `0002_autenticacion` y `0003_autor_imagenes` con `npm run db:migrate`
tras comprobar con `npm run db:historial` que el destino tenía exactamente 0000 y 0001. Resultado
verificado en solo lectura: 12 tablas con RLS y 0 políticas públicas, restricciones de `usuarios`,
claves foráneas (cascada en sesiones/verificaciones, `SET NULL` en `subida_por`) e índices únicos.
La API arrancó contra el destino real con Resend y Storage configurados.

Después se aplicaron `0004_modelo_ampliado` y `0005_retirar_tipo_texto` (destino sin datos de negocio, solo
cuentas): 19 tablas con RLS y 0 políticas, 9 tipos de servicio y Plan Anual sembrados, `instalaciones.tipo`
sustituido por `tipo_servicio_id`, checks e índices únicos de cobros presentes.

Se ejecutaron pruebas locales con Node 22.22.0 y PostgreSQL 16. Se verificó el bucket
privado `vehicles`. En la fase 3 (`npm run storage:verificar`) se comprobaron subida sin
sobrescritura, descarga con URL firmada, rechazo de la URL pública y borrado.
La tarifa pública consultada incluye 1 GB Storage, 5 GB egress y 5 GB cached egress
en Free; no determina qué plan tiene la organización del usuario.

Fuente de cuotas: https://supabase.com/pricing . La clave secreta de Supabase
debe permanecer exclusivamente en backend, sin prefijos VITE_ ni NEXT_PUBLIC_.
