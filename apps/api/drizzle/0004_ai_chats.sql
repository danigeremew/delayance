CREATE TABLE IF NOT EXISTS "ai_chats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE cascade,
  "title" text DEFAULT 'New chat' NOT NULL,
  "archived_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_chats_document_id_idx" ON "ai_chats" ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_chats_updated_at_idx" ON "ai_chats" ("updated_at");
--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD COLUMN IF NOT EXISTS "chat_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_chat_id_ai_chats_id_fk"
    FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_proposals_chat_id_idx" ON "ai_proposals" ("chat_id");
--> statement-breakpoint
-- Backfill: one chat per document that already has proposals
INSERT INTO "ai_chats" ("project_id", "document_id", "title", "created_at", "updated_at")
SELECT DISTINCT p."project_id", p."document_id", 'Earlier conversations', MIN(p."created_at"), MAX(p."created_at")
FROM "ai_proposals" p
WHERE p."chat_id" IS NULL
GROUP BY p."project_id", p."document_id";
--> statement-breakpoint
UPDATE "ai_proposals" p
SET "chat_id" = c."id"
FROM "ai_chats" c
WHERE p."chat_id" IS NULL
  AND c."document_id" = p."document_id"
  AND c."title" = 'Earlier conversations';
