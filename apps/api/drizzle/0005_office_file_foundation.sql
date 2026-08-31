-- Additive foundation for the LibreOffice/WOPI cutover. The destructive clean-break
-- migration is intentionally separate so the application remains runnable while the
-- office path is verified.

DO $$ BEGIN
  CREATE TYPE "public"."document_analysis_status" AS ENUM('pending', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."office_session_permission" AS ENUM('read', 'write');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_key" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_format" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_size" bigint;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "file_hash" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "current_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "analysis_content" jsonb;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "analysis_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "analysis_status" "document_analysis_status" DEFAULT 'pending' NOT NULL;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "analysis_error" text;
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "version_number" integer;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "file_key" text;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "file_hash" text;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "file_size" bigint;
ALTER TABLE "document_versions" ADD COLUMN IF NOT EXISTS "analysis_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "stored_objects" ADD COLUMN IF NOT EXISTS "sha256" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "office_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "permission" "office_session_permission" NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "office_sessions_document_id_idx" ON "office_sessions" ("document_id");
