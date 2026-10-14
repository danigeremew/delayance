import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { localPasswordSchema } from '@delayance/validation';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';

loadEnv({ path: resolve(__dirname, '../../../../.env') });
async function readPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += String(chunk);
      if (input.length > 1024) throw new Error('Password input is too long');
    }
    return input.replace(/\r?\n$/, '');
  }
  process.stdout.write(label);
  const previous = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolveInput, reject) => {
    let input = '';
    const finish = () => {
      process.stdin.removeListener('data', handler);
      process.stdin.setRawMode(previous);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const handler = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          resolveInput(input);
          return;
        }
        if (character === '\u007f' || character === '\b') input = input.slice(0, -1);
        else if (input.length < 256 && character >= ' ') input += character;
      }
    };
    process.stdin.on('data', handler);
  });
}
async function main() {
  const email = process.argv[2];
  if (!email)
    throw new Error(
      'Usage: pnpm auth:password EMAIL (password is read privately from the terminal)',
    );
  const password = await readPassword('New local password: ');
  if (process.stdin.isTTY && password !== (await readPassword('Confirm password: ')))
    throw new Error('Passwords do not match');
  const input = localPasswordSchema.parse({ email, password });
  const config = new AppConfigService();
  const database = new DatabaseService(config);
  const redis = new RedisService(config);
  try {
    await new AuthService(database, config, redis).setLocalDevelopmentPassword(
      input.email,
      input.password,
    );
    console.log('Local password set. Existing projects and account ID are preserved.');
  } finally {
    await database.onModuleDestroy();
    await redis.onModuleDestroy();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Password setup failed');
  process.exitCode = 1;
});
