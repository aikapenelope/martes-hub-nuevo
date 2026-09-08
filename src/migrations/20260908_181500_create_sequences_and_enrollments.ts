import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Collections sequences (cadena de pasos email/tarea/esperar) y
// sequence-enrollments (inscripciones con avance por pasada del job
// dispatch-sequences). Delta manual — el snapshot de drizzle no refleja el
// estado real de la BD (todas las migraciones de este repo son manuales).
// Incluye: enums nuevos, valor 'sequence' en enums source existentes, slug
// 'dispatch-sequences' en enums de jobs, índice único parcial que deduplica
// inscripciones activas por (tenant, secuencia, lead), y las columnas de
// payload_locked_documents_rels que agrega el multiTenantPlugin.
// El down no revierte ADD VALUE (no es reversible limpio; patrón add_lead_briefs).

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_sequences_steps_type" AS ENUM('email', 'tarea', 'esperar');
    CREATE TYPE "public"."enum_sequence_enrollments_status" AS ENUM('activa', 'completada', 'cancelada', 'respondida');
    ALTER TYPE "public"."enum_email_log_source" ADD VALUE IF NOT EXISTS 'sequence';
    ALTER TYPE "public"."enum_tasks_source" ADD VALUE IF NOT EXISTS 'sequence';
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'dispatch-sequences';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'dispatch-sequences';
    CREATE TABLE "sequences" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer,
      "name" varchar NOT NULL,
      "description" varchar,
      "active" boolean DEFAULT true,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE "sequences_steps" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "type" "enum_sequences_steps_type" NOT NULL,
      "subject" varchar,
      "body_html" varchar,
      "task_title" varchar,
      "task_due_in_days" numeric DEFAULT 3,
      "days" numeric
    );
    CREATE TABLE "sequence_enrollments" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer,
      "sequence_id" integer NOT NULL,
      "lead_id" integer NOT NULL,
      "status" "enum_sequence_enrollments_status" DEFAULT 'activa' NOT NULL,
      "current_step" numeric DEFAULT 0,
      "next_run_at" timestamp(3) with time zone NOT NULL,
      "enrolled_by_id" integer,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "sequences" ADD CONSTRAINT "sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "sequences_steps" ADD CONSTRAINT "sequences_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_enrolled_by_id_users_id_fk" FOREIGN KEY ("enrolled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "sequences_tenant_idx" ON "sequences" USING btree ("tenant_id");
    CREATE INDEX "sequences_updated_at_idx" ON "sequences" USING btree ("updated_at");
    CREATE INDEX "sequences_created_at_idx" ON "sequences" USING btree ("created_at");
    CREATE INDEX "sequences_steps_order_idx" ON "sequences_steps" USING btree ("_order");
    CREATE INDEX "sequences_steps_parent_id_idx" ON "sequences_steps" USING btree ("_parent_id");
    CREATE INDEX "sequence_enrollments_tenant_idx" ON "sequence_enrollments" USING btree ("tenant_id");
    CREATE INDEX "sequence_enrollments_sequence_idx" ON "sequence_enrollments" USING btree ("sequence_id");
    CREATE INDEX "sequence_enrollments_lead_idx" ON "sequence_enrollments" USING btree ("lead_id");
    CREATE INDEX "sequence_enrollments_enrolled_by_idx" ON "sequence_enrollments" USING btree ("enrolled_by_id");
    CREATE INDEX "sequence_enrollments_updated_at_idx" ON "sequence_enrollments" USING btree ("updated_at");
    CREATE INDEX "sequence_enrollments_created_at_idx" ON "sequence_enrollments" USING btree ("created_at");
    CREATE UNIQUE INDEX "sequence_enrollments_active_unique_idx" ON "sequence_enrollments" ("tenant_id","sequence_id","lead_id") WHERE (status = 'activa');
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sequences_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "sequence_enrollments_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sequences_fk" FOREIGN KEY ("sequences_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sequence_enrollments_fk" FOREIGN KEY ("sequence_enrollments_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_sequences_id_idx" ON "payload_locked_documents_rels" USING btree ("sequences_id");
    CREATE INDEX "payload_locked_documents_rels_sequence_enrollments_id_idx" ON "payload_locked_documents_rels" USING btree ("sequence_enrollments_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "sequence_enrollments_active_unique_idx";
    DROP TABLE IF EXISTS "sequence_enrollments" CASCADE;
    DROP TABLE IF EXISTS "sequences_steps" CASCADE;
    DROP TABLE IF EXISTS "sequences" CASCADE;
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sequence_enrollments_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sequences_id";
  `)
}
