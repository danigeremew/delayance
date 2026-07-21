-- Phase 7: FTS + pgvector embedding column + document search_text

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_text" text DEFAULT '' NOT NULL;

ALTER TABLE "project_sources" ADD COLUMN IF NOT EXISTS "process_status" text DEFAULT 'ready' NOT NULL;
ALTER TABLE "project_sources" ADD COLUMN IF NOT EXISTS "process_error" text;

ALTER TABLE "project_sources" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "project_sources" ADD COLUMN IF NOT EXISTS "embedding" vector(32);

ALTER TABLE "ai_proposals" ADD COLUMN IF NOT EXISTS "cited_source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "project_sources"
  ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(text_content, ''))
  ) STORED;

ALTER TABLE "project_memory_items"
  ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(search_text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS "project_sources_fts_idx" ON "project_sources" USING gin ("fts");
CREATE INDEX IF NOT EXISTS "project_memory_items_fts_idx" ON "project_memory_items" USING gin ("fts");
CREATE INDEX IF NOT EXISTS "comments_fts_idx" ON "comments" USING gin ("fts");
CREATE INDEX IF NOT EXISTS "documents_fts_idx" ON "documents" USING gin ("fts");
