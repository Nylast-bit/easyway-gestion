CREATE TYPE "public"."rol_usuario" AS ENUM('admin', 'tecnico');--> statement-breakpoint
CREATE TABLE "sesiones" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sesiones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usuarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"usuario" text,
	"correo" text,
	"contrasena_hash" text NOT NULL,
	"rol" "rol_usuario" DEFAULT 'tecnico' NOT NULL,
	"tecnico_id" integer,
	"correo_verificado_at" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_identificador" CHECK ("usuarios"."usuario" IS NOT NULL OR "usuarios"."correo" IS NOT NULL),
	CONSTRAINT "usuarios_usuario_formato" CHECK ("usuarios"."usuario" ~ '^[a-z0-9._-]{3,40}$'),
	CONSTRAINT "usuarios_correo_minusculas" CHECK ("usuarios"."correo" = lower("usuarios"."correo")),
	CONSTRAINT "usuarios_tecnico_rol" CHECK ("usuarios"."tecnico_id" IS NULL OR "usuarios"."rol" = 'tecnico')
);
--> statement-breakpoint
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verificaciones_correo" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verificaciones_correo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"usuario_id" integer NOT NULL,
	"desafio_hash" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"envios" integer DEFAULT 1 NOT NULL,
	"enviado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"usado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verificaciones_correo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tecnico_id_tecnicos_id_fk" FOREIGN KEY ("tecnico_id") REFERENCES "public"."tecnicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificaciones_correo" ADD CONSTRAINT "verificaciones_correo_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_usuario_unico" ON "usuarios" USING btree ("usuario");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_correo_unico" ON "usuarios" USING btree ("correo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_tecnico_unico" ON "usuarios" USING btree ("tecnico_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verificaciones_desafio_unico" ON "verificaciones_correo" USING btree ("desafio_hash");--> statement-breakpoint
CREATE INDEX "verificaciones_usuario_idx" ON "verificaciones_correo" USING btree ("usuario_id");