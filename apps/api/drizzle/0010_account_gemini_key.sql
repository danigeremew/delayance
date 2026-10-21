ALTER TABLE users ADD COLUMN encrypted_gemini_api_key text;
--> statement-breakpoint
-- Preserve an unambiguous existing key for its project owner across projects.
-- Owners with multiple saved keys must explicitly choose their account key.
WITH single_project_key AS (
  SELECT p.owner_id, min(s.encrypted_api_key) AS encrypted_key
  FROM project_ai_settings s
  JOIN projects p ON p.id = s.project_id
  WHERE s.provider = 'gemini' AND s.encrypted_api_key IS NOT NULL
  GROUP BY p.owner_id
  HAVING count(*) = 1
)
UPDATE users u
SET encrypted_gemini_api_key = k.encrypted_key
FROM single_project_key k
WHERE u.id = k.owner_id;
