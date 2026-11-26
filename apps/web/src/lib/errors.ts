import { ApiError } from './api.js';
import type { T } from './i18n.js';

export const fmtCode = (c: string) => c.replace(/(\d{4})(?=\d)/g, '$1 ');

export function errorMessage(t: T, e: unknown): string {
  if (e instanceof ApiError) {
    const map: Record<string, string> = {
      invalid_credentials: t.err_invalid_credentials,
      username_taken: t.err_username_taken,
      invalid_code: t.err_invalid_code,
      friend_code_taken: t.err_friend_code_taken,
      not_found: t.err_not_found,
      already_friends: t.err_already_friends,
      already_requested: t.err_already_requested,
      self: t.err_self,
      validation: t.err_validation,
      suspended: t.err_suspended,
      unknown_variant: t.err_unknown_variant,
      invalid_gender: t.err_invalid_gender,
      signups_closed: t.err_signups_closed,
      signups_full: t.err_signups_full,
      invite_required: t.err_invite_required,
      invalid_invite: t.err_invalid_invite,
    };
    // A suspension for a set time says until when.
    if (e.code === 'suspended' && typeof e.data.until === 'string') return t.err_suspended_until(new Date(e.data.until).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }));
    return map[e.code] ?? t.err_generic;
  }
  return t.err_generic;
}
