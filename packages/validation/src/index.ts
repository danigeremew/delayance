import { z } from 'zod';

export const officeSessionRequestSchema = z
  .object({ editor: z.enum(['collabora', 'wordcraft']).default('collabora') })
  .strict();

const editorUrlSchema = z
  .string()
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
export const officeBrowserSessionSchema = z.object({
  actionUrl: editorUrlSchema,
  wopiSource: editorUrlSchema,
  accessToken: z.string().min(1).max(2000),
  permission: z.enum(['read', 'write']),
});
export const wordcraftWopiInfoSchema = z.object({
  Version: z.string().regex(/^\d+:[a-f0-9]{64}$/),
});
export const wordcraftSaveSchema = z.object({ version: z.number().int().nonnegative().safe() });
export const wordcraftStatusSchema = z.object({
  MessageId: z.literal('App_LoadingStatus'),
  Values: z.object({ Status: z.enum(['Frame_Ready', 'Document_Loaded']) }),
});

export const wordcraftReplySchema = z.object({
  MessageId: z.literal('Delayance_Reply'),
  Values: z.object({
    requestId: z.string().uuid(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().optional(),
  }),
});

export const wordcraftSelectionSchema = z.object({
  text: z.string().max(50000),
  isCollapsed: z.boolean(),
  handle: z.string().min(1).max(100),
});

export const wordcraftFileSchema = z.object({
  MessageId: z.literal('Delayance_Docx'),
  Values: z.object({
    id: z.number().int().positive(),
    bytes: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.length > 0 && bytes.length <= 100 * 1024 * 1024),
  }),
});

export const geminiModelSchema = z
  .string()
  .trim()
  .regex(/^gemini-[a-zA-Z0-9._-]+$/, 'Use a Gemini model ID');

export const aiSettingsSchema = z
  .object({
    provider: z.literal('gemini').optional(),
    model: geminiModelSchema.optional(),
    policy: z.enum(['any', 'local_only']).optional(),
    apiKey: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const officeAiRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(20000),
  mode: z.enum(['auto', 'ask', 'edit', 'write', 'review']),
  preferredMode: z.enum(['edit', 'write']).optional(),
  chatId: z.string().uuid().optional(),
  selectedText: z.string().max(50000).default(''),
});

export const officeTextRevisionSchema = z
  .object({
    type: z.literal('office-text'),
    action: z.enum(['insert', 'replace']),
    originalText: z.string().max(50000),
    text: z.string().min(1).max(100000),
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().nonnegative(),
  })
  .strict();

export const officeAiAcceptanceSchema = z
  .object({
    accessToken: z.string().min(1).max(2000),
  })
  .strict();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: geminiModelSchema.default('gemini-3.8-flash'),
  API_PORT: z.coerce.number().default(48722),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(32).default('dev-auth-secret-change-me-for-production'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().email().optional(),
  ),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
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
  WORDCRAFT_BROWSER_URL: z.string().url().default('http://localhost:48721/wordcraft/index.html'),
  WORDCRAFT_WOPI_BASE_URL: z.string().url().default('http://localhost:48722'),
  WEB_ORIGIN: z.string().url().default('http://localhost:48721'),
  WOPI_BASE_URL: z.string().url().default('http://host.docker.internal:48722'),
  WOPI_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(28_800),
  WOPI_LOCK_TTL_SECONDS: z.coerce.number().int().min(60).max(7_200).default(1_800),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.parse(env);
  if (
    parsed.NODE_ENV === 'production' &&
    parsed.AUTH_JWT_SECRET === 'dev-auth-secret-change-me-for-production'
  )
    throw new Error('Set a private AUTH_JWT_SECRET in production');
  return parsed;
}

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

const email = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
const password = z.string().min(8).max(256);

export const localPasswordSchema = z.object({ email, password }).strict();

export const loginSchema = z.object({ email, password: z.string().min(1).max(256) });
export const registerSchema = z
  .object({
    email,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(256),
    password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
