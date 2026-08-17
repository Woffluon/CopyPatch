#!/usr/bin/env node
import { runInit, runServe, runPassword, runMigrate } from './index.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
CopyPatch CLI - Lightweight Inline Copy Editing Backend

Usage:
  copypatch <command> [options]

Commands:
  init         Initialize SQLite database, apply migrations & set password
  serve        Start the standalone CopyPatch server
  password     Change the editor password & invalidate sessions
  migrate      Apply SQLite schema migrations

Options for 'serve':
  --port <number>            Port to listen on (default: 4040)
  --db <path>                Path to SQLite database (default: ./copypatch.sqlite)
  --origin <url>             Allowed frontend origin (default: http://localhost:5173)
  --mode <direct|draft>      Publishing mode (default: direct)
`);
}

function parseOption(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return undefined;
}

async function main() {
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  const dbPath = parseOption('--db') || process.env.COPYPATCH_DB_PATH || './copypatch.sqlite';

  switch (command) {
    case 'init':
      await runInit(dbPath);
      break;
    case 'password':
      await runPassword(dbPath);
      break;
    case 'migrate':
      await runMigrate(dbPath);
      break;
    case 'serve': {
      const portRaw = parseOption('--port');
      const port = portRaw ? Number(portRaw) : undefined;
      const origin = parseOption('--origin');
      const mode = parseOption('--mode') as 'direct' | 'draft' | undefined;

      const opts: {
        port?: number | undefined;
        dbPath?: string | undefined;
        publicOrigin?: string | undefined;
        publishingMode?: 'direct' | 'draft' | undefined;
      } = {
        dbPath,
      };
      if (port !== undefined) opts.port = port;
      if (origin !== undefined) opts.publicOrigin = origin;
      if (mode !== undefined) opts.publishingMode = mode;

      await runServe(opts);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
