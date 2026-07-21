import { describe, expect, it } from 'vitest';
import { envSchema, registerSchema } from './index';

describe('envSchema', () => {
  it('parses valid env', () => {
    const result = envSchema.parse({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      SECRETS_ENCRYPTION_KEY: '0'.repeat(64),
      MINIO_ACCESS_KEY: 'key',
      MINIO_SECRET_KEY: 'secret',
    });
    expect(result.API_PORT).toBe(3001);
  });
});

describe('registerSchema', () => {
  it('rejects short passwords', () => {
    expect(() =>
      registerSchema.parse({ email: 'a@b.com', password: 'short', name: 'A' }),
    ).toThrow();
  });
});
