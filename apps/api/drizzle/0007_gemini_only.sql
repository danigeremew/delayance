-- Change defaults only. Keep existing policies, credentials and history intact.
ALTER TABLE project_ai_settings ALTER COLUMN provider SET DEFAULT 'gemini';
--> statement-breakpoint
ALTER TABLE project_ai_settings ALTER COLUMN model SET DEFAULT 'gemini-2.5-flash';
--> statement-breakpoint
ALTER TABLE project_ai_settings ALTER COLUMN policy SET DEFAULT 'any';
--> statement-breakpoint
ALTER TABLE project_ai_settings ALTER COLUMN base_url DROP DEFAULT;
