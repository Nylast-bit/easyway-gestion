CREATE TYPE "public"."estado_aprobacion" AS ENUM('Pendiente', 'Aprobada', 'Rechazada');--> statement-breakpoint
CREATE TYPE "public"."estado_servicio" AS ENUM('Activo', 'Suspendido', 'Cancelado');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro');--> statement-breakpoint
CREATE TYPE "public"."periodicidad_plan" AS ENUM('Mensual', 'Anual');--> statement-breakpoint
CREATE TYPE "public"."tipo_cliente" AS ENUM('Particular', 'Empresa');--> statement-breakpoint
CREATE TYPE "public"."tipo_vehiculo" AS ENUM('Carro', 'Motor', 'Camión', 'Otro');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"usuario_id" integer,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" integer,
	"detalle" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cargos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cliente_id" integer NOT NULL,
	"servicio_id" integer,
	"concepto" text NOT NULL,
	"periodo_inicio" date,
	"periodo_fin" date,
	"monto" numeric(12, 2) NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"referencia_factura" text,
	"creado_por" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone,
	"anulado_por" integer,
	"motivo_anulacion" text,
	CONSTRAINT "cargos_monto_positivo" CHECK ("cargos"."monto" > 0),
	CONSTRAINT "cargos_periodo" CHECK ("cargos"."periodo_fin" IS NULL OR "cargos"."periodo_inicio" IS NULL OR "cargos"."periodo_fin" >= "cargos"."periodo_inicio"),
	CONSTRAINT "cargos_anulacion_motivo" CHECK ("cargos"."anulado_at" IS NULL OR "cargos"."motivo_anulacion" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "cargos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pago_aplicaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pago_aplicaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pago_id" integer NOT NULL,
	"cargo_id" integer NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	CONSTRAINT "pago_aplicaciones_monto_positivo" CHECK ("pago_aplicaciones"."monto" > 0)
);
--> statement-breakpoint
ALTER TABLE "pago_aplicaciones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pagos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cliente_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"metodo" "metodo_pago" NOT NULL,
	"referencia" text,
	"notas" text,
	"registrado_por" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_at" timestamp with time zone,
	"anulado_por" integer,
	"motivo_anulacion" text,
	CONSTRAINT "pagos_monto_positivo" CHECK ("pagos"."monto" > 0),
	CONSTRAINT "pagos_anulacion_motivo" CHECK ("pagos"."anulado_at" IS NULL OR "pagos"."motivo_anulacion" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "pagos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "planes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "planes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"periodicidad" "periodicidad_plan" NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planes_precio_positivo" CHECK ("planes"."precio" >= 0)
);
--> statement-breakpoint
ALTER TABLE "planes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "servicios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vehiculo_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"fecha_inicio" date NOT NULL,
	"proximo_cobro" date NOT NULL,
	"estado" "estado_servicio" DEFAULT 'Activo' NOT NULL,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servicios_precio_positivo" CHECK ("servicios"."precio" >= 0),
	CONSTRAINT "servicios_fechas" CHECK ("servicios"."proximo_cobro" >= "servicios"."fecha_inicio")
);
--> statement-breakpoint
ALTER TABLE "servicios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tipos_servicio" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tipos_servicio_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tipos_servicio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "instalaciones" ALTER COLUMN "vehiculo_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "instalaciones" ALTER COLUMN "gps_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "tipo" "tipo_cliente" DEFAULT 'Particular' NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "documento" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "notas" text;--> statement-breakpoint
ALTER TABLE "gps" ADD COLUMN "fecha_vencimiento" date;--> statement-breakpoint
-- Editado a mano: conservar el tipo de las instalaciones existentes al pasar a catálogo.
ALTER TABLE "instalaciones" ADD COLUMN "tipo_servicio_id" integer;--> statement-breakpoint
INSERT INTO "tipos_servicio" ("nombre") VALUES ('Instalación'), ('Venta'), ('Mantenimiento'), ('Cambio de equipo'), ('Cambio de SIM'), ('Reinstalación'), ('Reparación'), ('Entrega'), ('Desinstalación');--> statement-breakpoint
INSERT INTO "tipos_servicio" ("nombre") SELECT min(trim("tipo")) FROM "instalaciones" WHERE trim("tipo") <> '' GROUP BY lower(trim("tipo")) HAVING NOT EXISTS (SELECT 1 FROM "tipos_servicio" t WHERE lower(t."nombre") = lower(trim(min("instalaciones"."tipo"))));--> statement-breakpoint
UPDATE "instalaciones" i SET "tipo_servicio_id" = t."id" FROM "tipos_servicio" t WHERE lower(t."nombre") = lower(trim(i."tipo"));--> statement-breakpoint
UPDATE "instalaciones" SET "tipo_servicio_id" = (SELECT "id" FROM "tipos_servicio" WHERE "nombre" = 'Instalación') WHERE "tipo_servicio_id" IS NULL;--> statement-breakpoint
ALTER TABLE "instalaciones" ALTER COLUMN "tipo_servicio_id" SET NOT NULL;--> statement-breakpoint
-- Plan vigente acordado con el usuario (2026-10-18).
INSERT INTO "planes" ("nombre", "periodicidad", "precio") VALUES ('Plan Anual', 'Anual', 5500);--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "aprobacion" "estado_aprobacion" DEFAULT 'Aprobada' NOT NULL;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "propuesta" jsonb;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "registrada_por" integer;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "revisada_por" integer;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "revisada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "motivo_rechazo" text;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "costo_tecnico" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "costo_pagado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD COLUMN "costo_pago_referencia" text;--> statement-breakpoint
ALTER TABLE "vehiculos" ADD COLUMN "tipo" "tipo_vehiculo" DEFAULT 'Carro' NOT NULL;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_aplicaciones" ADD CONSTRAINT "pago_aplicaciones_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_aplicaciones" ADD CONSTRAINT "pago_aplicaciones_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_vehiculo_id_vehiculos_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_plan_id_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_fecha_idx" ON "auditoria" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cargos_periodo_unico" ON "cargos" USING btree ("servicio_id","periodo_inicio") WHERE "cargos"."servicio_id" IS NOT NULL AND "cargos"."anulado_at" IS NULL;--> statement-breakpoint
CREATE INDEX "cargos_cliente_idx" ON "cargos" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pago_aplicaciones_unica" ON "pago_aplicaciones" USING btree ("pago_id","cargo_id");--> statement-breakpoint
CREATE INDEX "pago_aplicaciones_cargo_idx" ON "pago_aplicaciones" USING btree ("cargo_id");--> statement-breakpoint
CREATE INDEX "pagos_cliente_idx" ON "pagos" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "planes_nombre_unico" ON "planes" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "servicios_activo_unico" ON "servicios" USING btree ("vehiculo_id") WHERE "servicios"."estado" = 'Activo';--> statement-breakpoint
CREATE INDEX "servicios_vehiculo_idx" ON "servicios" USING btree ("vehiculo_id");--> statement-breakpoint
CREATE INDEX "servicios_plan_idx" ON "servicios" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_servicio_nombre_unico" ON "tipos_servicio" USING btree (lower("nombre"));--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_tipo_servicio_id_tipos_servicio_id_fk" FOREIGN KEY ("tipo_servicio_id") REFERENCES "public"."tipos_servicio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_registrada_por_usuarios_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_revisada_por_usuarios_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "instalaciones_aprobacion_idx" ON "instalaciones" USING btree ("aprobacion");--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_aprobada_completa" CHECK ("instalaciones"."aprobacion" <> 'Aprobada' OR ("instalaciones"."vehiculo_id" IS NOT NULL AND "instalaciones"."gps_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_costo_positivo" CHECK ("instalaciones"."costo_tecnico" IS NULL OR "instalaciones"."costo_tecnico" >= 0);--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_pago_con_costo" CHECK ("instalaciones"."costo_pagado_at" IS NULL OR "instalaciones"."costo_tecnico" IS NOT NULL);