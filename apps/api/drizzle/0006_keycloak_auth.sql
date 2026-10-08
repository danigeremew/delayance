ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "keycloak_subject" text;
CREATE UNIQUE INDEX "users_keycloak_subject_unique" ON "users" ("keycloak_subject") WHERE "keycloak_subject" IS NOT NULL;
