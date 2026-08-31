import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(48722),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/, 'SECRETS_ENCRYPTION_KEY must be 64 hex characters'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(59002),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default('delayance'),
  MINIO_USE_SSL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  AUTH_RATE_LIMIT_TTL_MS: z.coerce.number().default(60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),
  OFFICE_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  OFFICE_DISCOVERY_URL: z.string().url().default('http://localhost:9980/hosting/discovery'),
  OFFICE_BROWSER_URL: z.string().url().default('http://localhost:9980'),
  WEB_ORIGIN: z.string().url().default('http://localhost:48721'),
  WOPI_BASE_URL: z.string().url().default('http://host.docker.internal:48722'),
  WOPI_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(28_800),
  WOPI_LOCK_TTL_SECONDS: z.coerce.number().int().min(60).max(7_200).default(1_800),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  return envSchema.parse(env);
}

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});
