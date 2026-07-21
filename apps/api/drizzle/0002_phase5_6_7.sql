CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed');
CREATE TYPE "public"."ai_policy" AS ENUM('any', 'local_only');
CREATE TYPE "public"."ai_proposal_status" AS ENUM('pending', 'accepted', 'rejected');

CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "project_id" uuid,
  "document_id" uuid,
  "status" "job_status" DEFAULT 'queued' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "document_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "format" text NOT NULL,
  "stored_object_id" uuid,
  "compatibility_report" jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "document_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "document_id" uuid,
  "source_object_id" uuid,
  "mode" text NOT NULL,
  "style_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "preview_content" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_ai_settings" (
  "project_id" uuid PRIMARY KEY NOT NULL,
  "policy" "ai_policy" DEFAULT 'any' NOT NULL,
  "provider" text DEFAULT 'openai' NOT NULL,
  "model" text DEFAULT 'gpt-4o-mini' NOT NULL,
  "base_url" text,
  "encrypted_api_key" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "mode" text NOT NULL,
  "model" text NOT NULL,
  "provider" text NOT NULL,
  "prompt_summary" text NOT NULL,
  "context_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answer" text,
  "ops" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" "ai_proposal_status" DEFAULT 'pending' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "title" text NOT NULL,
  "source_type" text NOT NULL,
  "stored_object_id" uuid,
  "text_content" text DEFAULT '' NOT NULL,
  "outdated" boolean DEFAULT false NOT NULL,
  "ai_may_use" boolean DEFAULT true NOT NULL,
  "embedding" jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "background_jobs_project_id_idx" ON "background_jobs" USING btree ("project_id");
CREATE INDEX IF NOT EXISTS "ai_proposals_document_id_idx" ON "ai_proposals" USING btree ("document_id");
CREATE INDEX IF NOT EXISTS "project_sources_project_id_idx" ON "project_sources" USING btree ("project_id");
