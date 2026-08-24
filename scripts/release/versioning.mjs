const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const COMMIT_PATTERN = /^(?<type>feat|fix|perf|refactor|build|security|docs|ci|test|chore)(?:\((?<scope>[a-z0-9][a-z0-9._/-]*)\))?(?<breaking>!)?: (?<description>\S.*)$/;

export function parseVersion(version) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(`Unsupported release version: '${version}'`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function getVersionBump(message) {
  if (typeof message !== 'string' || message.length === 0) {
    throw new Error('Commit message must be a non-empty string.');
  }

  const normalized = message.replace(/\r\n/g, '\n');
  const header = normalized.split('\n', 1)[0];
  const match = COMMIT_PATTERN.exec(header);
  if (!match) {
    throw new Error(`Invalid Conventional Commit message: '${header}'`);
  }

  if (match.groups.breaking || /(?:^|\n)BREAKING CHANGE:\s+\S/.test(normalized)) {
    return 'major';
  }

  switch (match.groups.type) {
    case 'feat':
      return 'minor';
    case 'fix':
    case 'perf':
    case 'refactor':
    case 'build':
    case 'security':
      return 'patch';
    default:
      return 'none';
  }
}

export function getNextVersion(version, bump) {
  const current = parseVersion(version);
  switch (bump) {
    case 'major':
      return `${current.major + 1}.0.0`;
    case 'minor':
      return `${current.major}.${current.minor + 1}.0`;
    case 'patch':
      return `${current.major}.${current.minor}.${current.patch + 1}`;
    case 'none':
      return version;
    default:
      throw new Error(`Unsupported version bump: '${bump}'`);
  }
}
