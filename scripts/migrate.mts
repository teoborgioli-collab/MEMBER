// Applies scripts/schema.sql. Run with `npm run db:migrate` (reads .env.local).
import { readFile } from 'node:fs/promises';
import { connect } from '../lib/db';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL in .env.local first.');
  process.exit(1);
}
const sql = connect(url, { max: 1 });
try {
  await sql.unsafe(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  console.log('Database tables ready.');
} catch (err) {
  const { code, message } = err as { code?: string; message?: string };
  console.error(`Migration failed (${code ?? 'error'}): ${message ?? err}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
