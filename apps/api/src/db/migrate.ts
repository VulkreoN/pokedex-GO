import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, sql } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../drizzle');

async function run(attempt = 1): Promise<void> {
  try {
    await migrate(db, { migrationsFolder });
    console.log('migrations applied');
  } catch (e) {
    if (attempt < 10) {
      console.log(`database not ready (${(e as Error).message.split('\n')[0]}), retry ${attempt}/10`);
      await new Promise((r) => setTimeout(r, 2000));
      return run(attempt + 1);
    }
    throw e;
  }
}

run()
  .then(() => sql.end())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
