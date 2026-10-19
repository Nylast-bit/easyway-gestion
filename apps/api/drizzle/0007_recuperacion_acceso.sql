ALTER TABLE "usuarios" ADD COLUMN "cedula" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "debe_cambiar_contrasena" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verificaciones_correo" ADD COLUMN "proposito" text DEFAULT 'verificar' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_cedula_unica" ON "usuarios" USING btree ("cedula");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cedula_formato" CHECK ("usuarios"."cedula" ~ '^[0-9]{11}$');--> statement-breakpoint
ALTER TABLE "verificaciones_correo" ADD CONSTRAINT "verificaciones_proposito" CHECK ("verificaciones_correo"."proposito" IN ('verificar', 'recuperar'));