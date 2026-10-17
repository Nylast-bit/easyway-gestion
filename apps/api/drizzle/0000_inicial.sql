CREATE TYPE "public"."estado_gps" AS ENUM('Disponible', 'Instalado', 'Retirado', 'Dañado');--> statement-breakpoint
CREATE TYPE "public"."estado_instalacion" AS ENUM('En Proceso', 'Completado', 'Cancelado');--> statement-breakpoint
CREATE TYPE "public"."estado_simcard" AS ENUM('Disponible', 'Asignada', 'Suspendida', 'Vencida');--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clientes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"telefono" text,
	"correo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"imei" text NOT NULL,
	"modelo" text,
	"estado" "estado_gps" DEFAULT 'Disponible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_imei_formato" CHECK ("gps"."imei" ~ '^[0-9]{15}$')
);
--> statement-breakpoint
ALTER TABLE "gps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "gps_asignaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gps_asignaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"gps_id" integer NOT NULL,
	"vehiculo_id" integer NOT NULL,
	"fecha_inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_fin" timestamp with time zone,
	CONSTRAINT "gps_asignaciones_fechas" CHECK ("gps_asignaciones"."fecha_fin" IS NULL OR "gps_asignaciones"."fecha_fin" >= "gps_asignaciones"."fecha_inicio")
);
--> statement-breakpoint
ALTER TABLE "gps_asignaciones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "instalaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instalaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vehiculo_id" integer NOT NULL,
	"gps_id" integer NOT NULL,
	"simcard_id" integer,
	"tecnico_id" integer,
	"fecha_instalacion" timestamp with time zone,
	"tipo" text DEFAULT 'Instalación' NOT NULL,
	"asunto" text,
	"notas" text,
	"estado" "estado_instalacion" DEFAULT 'En Proceso' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instalaciones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "simcard_asignaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "simcard_asignaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"simcard_id" integer NOT NULL,
	"gps_id" integer NOT NULL,
	"fecha_inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_fin" timestamp with time zone,
	CONSTRAINT "simcard_asignaciones_fechas" CHECK ("simcard_asignaciones"."fecha_fin" IS NULL OR "simcard_asignaciones"."fecha_fin" >= "simcard_asignaciones"."fecha_inicio")
);
--> statement-breakpoint
ALTER TABLE "simcard_asignaciones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "simcards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "simcards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"numero" text NOT NULL,
	"fecha_compra" date,
	"fecha_vencimiento" date,
	"estado" "estado_simcard" DEFAULT 'Disponible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simcards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tecnicos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tecnicos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"telefono" text,
	"correo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tecnicos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vehiculo_imagenes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vehiculo_imagenes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vehiculo_id" integer NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehiculo_imagenes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vehiculos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vehiculos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cliente_id" integer NOT NULL,
	"marca" text,
	"modelo" text,
	"año" integer,
	"placa" text,
	"chasis" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehiculos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gps_asignaciones" ADD CONSTRAINT "gps_asignaciones_gps_id_gps_id_fk" FOREIGN KEY ("gps_id") REFERENCES "public"."gps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_asignaciones" ADD CONSTRAINT "gps_asignaciones_vehiculo_id_vehiculos_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_vehiculo_id_vehiculos_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_gps_id_gps_id_fk" FOREIGN KEY ("gps_id") REFERENCES "public"."gps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_simcard_id_simcards_id_fk" FOREIGN KEY ("simcard_id") REFERENCES "public"."simcards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simcard_asignaciones" ADD CONSTRAINT "simcard_asignaciones_simcard_id_simcards_id_fk" FOREIGN KEY ("simcard_id") REFERENCES "public"."simcards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simcard_asignaciones" ADD CONSTRAINT "simcard_asignaciones_gps_id_gps_id_fk" FOREIGN KEY ("gps_id") REFERENCES "public"."gps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculo_imagenes" ADD CONSTRAINT "vehiculo_imagenes_vehiculo_id_vehiculos_id_fk" FOREIGN KEY ("vehiculo_id") REFERENCES "public"."vehiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gps_imei_unico" ON "gps" USING btree ("imei");--> statement-breakpoint
CREATE UNIQUE INDEX "gps_asignacion_activa_unica" ON "gps_asignaciones" USING btree ("gps_id") WHERE "gps_asignaciones"."fecha_fin" IS NULL;--> statement-breakpoint
CREATE INDEX "gps_asignaciones_vehiculo_idx" ON "gps_asignaciones" USING btree ("vehiculo_id");--> statement-breakpoint
CREATE INDEX "instalaciones_vehiculo_idx" ON "instalaciones" USING btree ("vehiculo_id");--> statement-breakpoint
CREATE INDEX "instalaciones_gps_idx" ON "instalaciones" USING btree ("gps_id");--> statement-breakpoint
CREATE INDEX "instalaciones_simcard_idx" ON "instalaciones" USING btree ("simcard_id");--> statement-breakpoint
CREATE INDEX "instalaciones_tecnico_idx" ON "instalaciones" USING btree ("tecnico_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simcard_asignacion_activa_unica" ON "simcard_asignaciones" USING btree ("simcard_id") WHERE "simcard_asignaciones"."fecha_fin" IS NULL;--> statement-breakpoint
CREATE INDEX "simcard_asignaciones_gps_idx" ON "simcard_asignaciones" USING btree ("gps_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simcards_numero_unico" ON "simcards" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "vehiculo_imagenes_ruta_unica" ON "vehiculo_imagenes" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX "vehiculo_imagenes_vehiculo_idx" ON "vehiculo_imagenes" USING btree ("vehiculo_id");--> statement-breakpoint
CREATE INDEX "vehiculos_cliente_idx" ON "vehiculos" USING btree ("cliente_id");