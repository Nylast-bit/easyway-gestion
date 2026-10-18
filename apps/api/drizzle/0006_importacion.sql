CREATE TYPE "public"."estado_importacion" AS ENUM('Analizada', 'Confirmada', 'Revertida', 'Descartada');--> statement-breakpoint
CREATE TABLE "importacion_filas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "importacion_filas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"importacion_id" integer NOT NULL,
	"hoja" text NOT NULL,
	"fila" integer NOT NULL,
	"datos" jsonb,
	"advertencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errores" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "importacion_filas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "importacion_registros" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "importacion_registros_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"importacion_id" integer NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "importacion_registros" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "importaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "importaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"archivo_nombre" text NOT NULL,
	"archivo_hash" text NOT NULL,
	"estado" "estado_importacion" DEFAULT 'Analizada' NOT NULL,
	"resumen" jsonb NOT NULL,
	"opciones" jsonb,
	"creado_por" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmada_por" integer,
	"confirmada_at" timestamp with time zone,
	"revertida_por" integer,
	"revertida_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "importaciones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "importacion_filas" ADD CONSTRAINT "importacion_filas_importacion_id_importaciones_id_fk" FOREIGN KEY ("importacion_id") REFERENCES "public"."importaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacion_registros" ADD CONSTRAINT "importacion_registros_importacion_id_importaciones_id_fk" FOREIGN KEY ("importacion_id") REFERENCES "public"."importaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_confirmada_por_usuarios_id_fk" FOREIGN KEY ("confirmada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_revertida_por_usuarios_id_fk" FOREIGN KEY ("revertida_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "importacion_filas_importacion_idx" ON "importacion_filas" USING btree ("importacion_id","hoja","fila");--> statement-breakpoint
CREATE UNIQUE INDEX "importacion_registros_unico" ON "importacion_registros" USING btree ("tabla","registro_id");--> statement-breakpoint
CREATE INDEX "importacion_registros_importacion_idx" ON "importacion_registros" USING btree ("importacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "importaciones_archivo_vigente" ON "importaciones" USING btree ("archivo_hash") WHERE "importaciones"."estado" IN ('Analizada', 'Confirmada');