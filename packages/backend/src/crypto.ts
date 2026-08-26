import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { verify } from '@node-rs/argon2';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hashRateLimitKey(value: string): string {
  return hashToken(`copypatch-rate-limit\0${value}`);
}

export function hashesEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function verifyPassphrase(passphrase: string, argon2idHash: string): Promise<boolean> {
  if (!argon2idHash.startsWith('$argon2id$')) return false;
  try {
    return await verify(argon2idHash, passphrase);
  } catch {
    return false;
  }
}
