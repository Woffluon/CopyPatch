import readline from 'node:readline';
import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { eq } from 'drizzle-orm';
import { initDatabase } from '../db/index.js';
import * as schema from '../db/schema.js';
import { hashPassword } from '../auth/crypto.js';
import { createCopyPatchServer } from '../server.js';

export function promptSecret(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Mute stdout while typing password
    const oldWrite = process.stdout.write;
    process.stdout.write(promptText);

    let isMuted = true;
    (process.stdout as any).write = (chunk: any, encoding: any, callback: any) => {
      if (isMuted && typeof chunk === 'string' && !chunk.includes(promptText)) {
        return true;
      }
      return oldWrite.call(process.stdout, chunk, encoding, callback);
    };

    rl.question('', (answer) => {
      isMuted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runInit(dbPath = './copypatch.sqlite') {
  if (fs.existsSync(dbPath)) {
    console.log(`Database file already exists at: ${dbPath}`);
  }
  console.log(`\nInitializing CopyPatch SQLite database at: ${dbPath}`);
  const dbConn = initDatabase(dbPath);

  const existingAuth = dbConn.db.select().from(schema.authCredentials).get();
  if (existingAuth) {
    console.log('CopyPatch database is already initialized with an admin password.');
    console.log('Use `copypatch password` to change the editor password.');
    dbConn.sqlite.close();
    return;
  }

  console.log('Setting up editor authentication credentials.');
  console.log('Password must be between 12 and 256 characters.');

  let password = '';
  while (true) {
    password = await promptSecret('Enter new editor password: ');
    if (password.length < 12) {
      console.log('Password must be at least 12 characters. Please try again.');
      continue;
    }
    if (password.length > 256) {
      console.log('Password must not exceed 256 characters. Please try again.');
      continue;
    }

    const confirm = await promptSecret('Confirm editor password: ');
    if (password !== confirm) {
      console.log('Passwords do not match. Please try again.');
      continue;
    }
    break;
  }

  const passHash = await hashPassword(password);
  dbConn.db.insert(schema.authCredentials).values({
    id: 1,
    passwordHash: passHash,
    updatedAt: new Date(),
  }).run();

  dbConn.sqlite.close();
  console.log('\n✓ CopyPatch successfully initialized! Ready for production.');
}

export async function runPassword(dbPath = './copypatch.sqlite') {
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}. Please run \`copypatch init\` first.`);
    process.exit(1);
  }

  const dbConn = initDatabase(dbPath);

  console.log('Updating CopyPatch editor password.');
  let password = '';
  while (true) {
    password = await promptSecret('Enter new editor password: ');
    if (password.length < 12) {
      console.log('Password must be at least 12 characters. Please try again.');
      continue;
    }
    if (password.length > 256) {
      console.log('Password must not exceed 256 characters. Please try again.');
      continue;
    }

    const confirm = await promptSecret('Confirm editor password: ');
    if (password !== confirm) {
      console.log('Passwords do not match. Please try again.');
      continue;
    }
    break;
  }

  const passHash = await hashPassword(password);
  dbConn.db.update(schema.authCredentials)
    .set({
      passwordHash: passHash,
      updatedAt: new Date(),
    })
    .where(eq(schema.authCredentials.id, 1))
    .run();

  // Invalidate all active sessions for security
  dbConn.db.delete(schema.sessions).run();
  dbConn.sqlite.close();

  console.log('\n✓ Editor password updated and all existing sessions invalidated.');
}

export async function runMigrate(dbPath = './copypatch.sqlite') {
  console.log(`Running database schema migrations for ${dbPath}...`);
  const dbConn = initDatabase(dbPath);
  dbConn.sqlite.close();
  console.log('✓ Migrations applied successfully.');
}

export interface RunServeOptions {
  port?: number | undefined;
  dbPath?: string | undefined;
  publicOrigin?: string | undefined;
  publishingMode?: 'direct' | 'draft' | undefined;
}

export async function runServe(options: RunServeOptions) {
  const port = options.port ?? (Number(process.env.PORT) || 4040);
  const dbPath = options.dbPath ?? (process.env.COPYPATCH_DB_PATH || './copypatch.sqlite');
  const publicOrigin = options.publicOrigin ?? (process.env.COPYPATCH_ORIGIN || 'http://localhost:5173');
  const publishingMode = (options.publishingMode ?? (process.env.COPYPATCH_PUBLISHING_MODE || 'direct')) as 'direct' | 'draft';

  console.log(`\nStarting CopyPatch Standalone Server on port ${port}...`);
  console.log(`  Database:        ${dbPath}`);
  console.log(`  Public Origin:   ${publicOrigin}`);
  console.log(`  Publishing Mode: ${publishingMode}`);

  const dbConn = initDatabase(dbPath);
  const serverInstance = createCopyPatchServer(
    {
      dbPath,
      publicOrigin,
      publishingMode,
    },
    dbConn
  );

  serve({
    fetch: serverInstance.app.fetch,
    port,
  }, (info) => {
    console.log(`✓ CopyPatch server listening on http://localhost:${info.port}`);
    console.log(`  Public Content API: http://localhost:${info.port}/__copypatch/api/v1/content/:locale`);
    console.log(`  Health Check:       http://localhost:${info.port}/healthz\n`);
  });
}
