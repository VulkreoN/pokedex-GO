import { randomBytes, createHash } from 'node:crypto';
import { customAlphabet } from 'nanoid';

export const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

/** 12-digit code, shown grouped by 4 like a trainer code. */
export function newFriendCode(): string {
  let code = '';
  const bytes = randomBytes(12);
  for (let i = 0; i < 12; i++) code += String(bytes[i]! % 10);
  return code;
}

export function normalizeFriendCode(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length === 12 ? digits : null;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newShareToken(): string {
  return randomBytes(12).toString('base64url');
}
