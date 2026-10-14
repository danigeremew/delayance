-- Keep user/project IDs and legacy identity metadata. Passwords must be reset for
-- accounts whose password_hash is NULL. Prior identity-provider sessions expire.
UPDATE "sessions" SET "revoked_at" = now() WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" (lower("email"));
