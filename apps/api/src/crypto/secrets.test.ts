import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secrets';

describe('secrets encryption', () => {
  const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('round-trips a secret', () => {
    const encrypted = encryptSecret('sk-test-key', key);
    expect(decryptSecret(encrypted, key)).toBe('sk-test-key');
  });

  it('produces different ciphertexts', () => {
    const a = encryptSecret('same', key);
    const b = encryptSecret('same', key);
    expect(a).not.toBe(b);
  });
});
