-- Apply the 24-hour limit to existing active sessions without deleting accounts.
UPDATE "sessions"
SET "expires_at" = LEAST("expires_at", "created_at" + interval '1 day')
WHERE "revoked_at" IS NULL AND "expires_at" > "created_at" + interval '1 day';
