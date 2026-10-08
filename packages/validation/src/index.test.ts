import { describe, expect, it } from 'vitest';
import { envSchema } from './index';

describe('envSchema', () => {
  it('parses valid env', () => {
    const result = envSchema.parse({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      SECRETS_ENCRYPTION_KEY: '0'.repeat(64),
      MINIO_ACCESS_KEY: 'key',
      MINIO_SECRET_KEY: 'secret',
    });
    expect(result.API_PORT).toBe(48722);
    expect(
      envSchema.parse({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
        SECRETS_ENCRYPTION_KEY: '0'.repeat(64),
        MINIO_ACCESS_KEY: 'key',
        MINIO_SECRET_KEY: 'secret',
        SMTP_HOST: '',
        SMTP_FROM: '',
      }).SMTP_FROM,
    ).toBeUndefined();
  });
});
