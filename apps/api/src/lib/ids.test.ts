import { describe, expect, it } from 'vitest';
import { newFriendCode, normalizeFriendCode } from './ids.js';

describe('friend codes', () => {
  it('are 12 digits', () => {
    for (let i = 0; i < 20; i++) expect(newFriendCode()).toMatch(/^\d{12}$/);
  });
  it('normalize spaces and dashes', () => {
    expect(normalizeFriendCode('1234 5678-9012')).toBe('123456789012');
    expect(normalizeFriendCode('1234')).toBeNull();
  });
});
