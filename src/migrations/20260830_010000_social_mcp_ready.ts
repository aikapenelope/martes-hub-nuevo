import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * F7 Social nunca tuvo migración propia: `social-accounts`, `social-posts`
 * y `post-metrics` existían en `payload.config.ts` desde que se agregaron,
 * pero ninguna migración creó sus tablas (confirmado: ninguna migración ni
 * snapshot previo las menciona). Esta migración las crea desde su forma
 * actual — ya simplificada, sin los campos de token/expiración de la Graph
 * API de Meta que este mismo cambio retira — y agrega las columnas que
 * `payload_locked_documents_rels` necesita para poder bloquear/editar
 * documentos de estas 3 colecciones desde el admin.
 *
 * `social_posts.media` es un `relationship` con `hasMany: true` a una sola
 * colección (`media`): Payload lo modela con una tabla de unión dedicada
 * (`social_posts_rels`), no con el patrón polimórfico de `_rels` compartido
 * entre colecciones — mismo patrón que usa Payload para cualquier campo
 * hasMany de una sola relación.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_social_accounts_platform" AS ENUM('instagram', 'facebook');
  CREATE TYPE "public"."enum_social_accounts_status" AS ENUM('conectada', 'desconectada', 'expirada');
  CREATE TYPE "public"."enum_social_posts_status" AS ENUM('borrador', 'programado', 'publicado', 'fallido');

  CREATE TABLE "social_accounts" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "account_name" varchar NOT NULL,
   "platform" "public"."enum_social_accounts_platform" NOT NULL,
   "platform_account_id" varchar NOT NULL,
   "status" "public"."enum_social_accounts_status" DEFAULT 'conectada' NOT NULL,
   "profile_picture_url" varchar,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "social_accounts_tenant_idx" ON "social_accounts" USING btree ("tenant_id");
  CREATE INDEX "social_accounts_updated_at_idx" ON "social_accounts" USING btree ("updated_at");
  CREATE INDEX "social_accounts_created_at_idx" ON "social_accounts" USING btree ("created_at");

  CREATE TABLE "social_posts" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "caption" varchar NOT NULL,
   "account_id" integer NOT NULL,
   "status" "public"."enum_social_posts_status" DEFAULT 'borrador' NOT NULL,
   "scheduled_at" timestamp(3) with time zone,
   "published_at" timestamp(3) with time zone,
   "platform_post_id" varchar,
   "permalink" varchar,
   "last_error" varchar,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "social_posts_tenant_idx" ON "social_posts" USING btree ("tenant_id");
  CREATE INDEX "social_posts_account_idx" ON "social_posts" USING btree ("account_id");
  CREATE INDEX "social_posts_updated_at_idx" ON "social_posts" USING btree ("updated_at");
  CREATE INDEX "social_posts_created_at_idx" ON "social_posts" USING btree ("created_at");

  CREATE TABLE "social_posts_rels" (
   "id" serial PRIMARY KEY NOT NULL,
   "order" integer,
   "parent_id" integer NOT NULL,
   "path" varchar NOT NULL,
   "media_id" integer
  );
  ALTER TABLE "social_posts_rels" ADD CONSTRAINT "social_posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "social_posts_rels" ADD CONSTRAINT "social_posts_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "social_posts_rels_order_idx" ON "social_posts_rels" USING btree ("order");
  CREATE INDEX "social_posts_rels_parent_idx" ON "social_posts_rels" USING btree ("parent_id");
  CREATE INDEX "social_posts_rels_path_idx" ON "social_posts_rels" USING btree ("path");
  CREATE INDEX "social_posts_rels_media_id_idx" ON "social_posts_rels" USING btree ("media_id");

  CREATE TABLE "post_metrics" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "post_id" integer NOT NULL,
   "recorded_at" timestamp(3) with time zone NOT NULL,
   "impressions" numeric DEFAULT 0,
   "reach" numeric DEFAULT 0,
   "likes" numeric DEFAULT 0,
   "comments" numeric DEFAULT 0,
   "shares" numeric DEFAULT 0,
   "saved" numeric DEFAULT 0,
   "raw_metrics" jsonb,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "post_metrics_tenant_idx" ON "post_metrics" USING btree ("tenant_id");
  CREATE INDEX "post_metrics_post_idx" ON "post_metrics" USING btree ("post_id");
  CREATE INDEX "post_metrics_updated_at_idx" ON "post_metrics" USING btree ("updated_at");
  CREATE INDEX "post_metrics_created_at_idx" ON "post_metrics" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_accounts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_posts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "post_metrics_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_accounts_fk" FOREIGN KEY ("social_accounts_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_posts_fk" FOREIGN KEY ("social_posts_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_post_metrics_fk" FOREIGN KEY ("post_metrics_id") REFERENCES "public"."post_metrics"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_social_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_social_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_posts_id");
  CREATE INDEX "payload_locked_documents_rels_post_metrics_id_idx" ON "payload_locked_documents_rels" USING btree ("post_metrics_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_accounts_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_posts_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_post_metrics_fk";
  DROP INDEX "payload_locked_documents_rels_social_accounts_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_posts_id_idx";
  DROP INDEX "payload_locked_documents_rels_post_metrics_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_accounts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_posts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "post_metrics_id";

  DROP TABLE "post_metrics";
  DROP TABLE "social_posts_rels";
  DROP TABLE "social_posts";
  DROP TABLE "social_accounts";

  DROP TYPE "public"."enum_social_posts_status";
  DROP TYPE "public"."enum_social_accounts_status";
  DROP TYPE "public"."enum_social_accounts_platform";`)
}
