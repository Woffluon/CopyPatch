import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function executableFromWindowsShim(commandPath, readFile = readFileSync, exists = existsSync) {
  try {
    const content = readFile(commandPath, 'utf8');
    const match = content.match(/@?"%~dp0\\([^"\r\n]+\.exe)"/i);
    if (!match) return undefined;
    const executable = path.win32.resolve(path.win32.dirname(commandPath), match[1]);
    return exists(executable) ? executable : undefined;
  } catch {
    return undefined;
  }
}

export function resolvePnpmInvocation({
  platform = process.platform,
  env = process.env,
  readFile = readFileSync,
  exists = existsSync,
} = {}) {
  if (platform !== 'win32') return { command: 'pnpm', prefix: [] };

  const home = env.PNPM_HOME;
  if (home) {
    for (const commandPath of [path.win32.join(home, 'pnpm.cmd'), path.win32.join(home, 'bin', 'pnpm.cmd')]) {
      const executable = executableFromWindowsShim(commandPath, readFile, exists);
      if (executable) return { command: executable, prefix: [] };
    }
  }
  return { command: 'pnpm.cmd', prefix: [] };
}

export function resolveCorepackInvocation({
  platform = process.platform,
  env = process.env,
  exists = existsSync,
} = {}) {
  if (platform !== 'win32') return { command: 'corepack', prefix: [] };

  for (const directory of (env.PATH ?? '').split(path.win32.delimiter).filter(Boolean)) {
    const corepackCli = path.win32.join(directory, 'node_modules', 'corepack', 'dist', 'corepack.js');
    if (!exists(path.win32.join(directory, 'corepack.cmd')) || !exists(corepackCli)) continue;
    const bundledNode = path.win32.join(directory, 'node.exe');
    return { command: exists(bundledNode) ? bundledNode : process.execPath, prefix: [corepackCli] };
  }

  return { command: 'corepack.cmd', prefix: [] };
}
