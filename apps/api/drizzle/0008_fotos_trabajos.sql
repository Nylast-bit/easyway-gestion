ALTER TABLE "vehiculo_imagenes" ALTER COLUMN "vehiculo_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehiculo_imagenes" ADD COLUMN "instalacion_id" integer;--> statement-breakpoint
ALTER TABLE "vehiculo_imagenes" ADD CONSTRAINT "vehiculo_imagenes_instalacion_id_instalaciones_id_fk" FOREIGN KEY ("instalacion_id") REFERENCES "public"."instalaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehiculo_imagenes_instalacion_idx" ON "vehiculo_imagenes" USING btree ("instalacion_id");--> statement-breakpoint
ALTER TABLE "vehiculo_imagenes" ADD CONSTRAINT "vehiculo_imagenes_destino" CHECK ("vehiculo_imagenes"."vehiculo_id" IS NOT NULL OR "vehiculo_imagenes"."instalacion_id" IS NOT NULL);