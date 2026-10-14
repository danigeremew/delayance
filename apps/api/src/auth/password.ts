import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';

const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    derive(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const match = stored && /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
  // Keep missing accounts and invalid legacy hashes on the same expensive verification path.
  const salt = Buffer.from(match?.[1] ?? '0'.repeat(32), 'hex');
  const expected = Buffer.from(match?.[2] ?? '0'.repeat(128), 'hex');
  const actual = await scrypt(password, salt);
  return Boolean(match) && timingSafeEqual(actual, expected);
}
