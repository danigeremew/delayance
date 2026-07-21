import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

loadEnv({ path: resolve(__dirname, '../../../../.env') });
loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  await pool.end();
  console.log('Migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
