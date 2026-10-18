# Base de datos inicial — fase 1

## Alcance y decisiones

El proyecto antiguo no está accesible y no hay datos que conservar. Las nueve
tablas se reconstruyeron desde `src/types.ts`, páginas y formularios. La fuente
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

La fase 2 migrará la SPA a Next.js App Router y consolidará npm workspaces, conservando
Hono como backend separado. Las herramientas de BD ya
usan la ubicación final `apps/api`, pero las dependencias siguen en el paquete raíz.
Antes de cargar datos reales se incorporarán respaldo/restauración. No se necesita
copiar Storage ni respaldar una base antigua inexistente. El Excel se carga en fase 6.

## Verificación del destino

Se comprobó primero que `public` no tenía tablas. Después se aplicaron `0000_inicial`
y `0001_indices_historial` mediante Drizzle y se verificaron las nueve tablas con
RLS habilitado y cero políticas públicas en PostgreSQL 17.11. No se importaron datos.
La segunda migración añade índices completos para consultar el historial de GPS/SIM;
los índices parciales existentes solo cubren asignaciones activas.

Se ejecutaron pruebas locales con Node 22.22.0 y PostgreSQL 16. Se verificó el bucket
privado `vehicles`; falta probar operaciones de archivos por API en la fase 3.
La tarifa pública consultada incluye 1 GB Storage, 5 GB egress y 5 GB cached egress
en Free; no determina qué plan tiene la organización del usuario.

Fuente de cuotas: https://supabase.com/pricing . La clave secreta de Supabase
debe permanecer exclusivamente en backend, sin prefijos VITE_ ni NEXT_PUBLIC_.
