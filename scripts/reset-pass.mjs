import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from '../packages/server/dist/db/index.js';
import * as schema from '../packages/server/dist/db/schema.js';
import { hashPassword } from '../packages/server/dist/auth/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dbPath = path.join(rootDir, 'copypatch.sqlite');

async function main() {
  const newPassword = process.argv[2] || process.env.NEW_PASSWORD;
  if (!newPassword || newPassword.length < 12) {
    console.error('Usage: node scripts/reset-pass.mjs <new-password> (minimum 12 characters)');
    process.exit(1);
  }

  const dbConn = initDatabase(dbPath);
  const passHash = await hashPassword(newPassword);
  dbConn.db.delete(schema.authCredentials).run();
  dbConn.db.insert(schema.authCredentials).values({
    id: 1,
    passwordHash: passHash,
    updatedAt: new Date(),
  }).run();
  dbConn.db.delete(schema.sessions).run();
  dbConn.sqlite.close();
  console.log('✓ Password reset successfully in ' + dbPath);
}

main();
