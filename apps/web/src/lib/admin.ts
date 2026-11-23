import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Gender, LocalizedText, Role } from '@mydexpogo/shared';
import { api } from './api.js';

export interface SourceFreshness { name: string; label: string; updatedAt: string | null; url: string }
export interface DataStatus {
  generatedAt: string | null;
  version: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  nextRunAt: string | null;
  refreshHours: number;
  running: boolean;
  stats: { species?: number; variants?: number; datamined?: number } | null;
  eventsArchived: number;
  sources: SourceFreshness[];
  feed?: { enabled: { discord: string[]; news: string[] }; lastRunAt: string | null; lastError: string | null; running: boolean; pending: number };
}
export interface Override { variantKey: string; released: boolean | null; label: LocalizedText | null; genders: Gender[] | null; shinyReleased: boolean | null; noEvolve: boolean | null; updatedBy: string | null; updatedAt: string }

export const useDataStatus = () => useQuery({ queryKey: ['data-status'], queryFn: () => api<DataStatus>('/data/status'), refetchInterval: (q) => (q.state.data?.running ? 5000 : false) });

export const useOverrides = (enabled: boolean) =>
  useQuery({ queryKey: ['overrides'], queryFn: () => api<{ overrides: Override[] }>('/overrides').then((r) => r.overrides), enabled });

export function useSetOverride() {
  const qc = useQueryClient();
  return useMutation({
    // A save rewrites the whole correction: callers pass every field, the ones they did not touch included.
    mutationFn: (vars: { variantKey: string; released?: boolean | null; label?: LocalizedText | null; genders?: Gender[] | null; shinyReleased?: boolean | null; noEvolve?: boolean | null }) =>
      api<{ ok: true }>(`/overrides/${vars.variantKey}`, {
        method: 'PUT',
        body: { released: vars.released ?? null, label: vars.label ?? null, genders: vars.genders ?? null, shinyReleased: vars.shinyReleased ?? null, noEvolve: vars.noEvolve ?? null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overrides'] });
      qc.invalidateQueries({ queryKey: ['dataset'] });
    },
  });
}

export function useRefreshData() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api<{ started: boolean }>('/data/refresh', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['data-status'] }) });
}

export interface AdminUser { id: string; username: string; role: Role; friendCode: string; createdAt: string }
export const useUsers = (q: string, offset: number, enabled: boolean) =>
  useQuery({ queryKey: ['users', q, offset], queryFn: () => api<{ users: AdminUser[]; total: number; offset: number }>(`/users?q=${encodeURIComponent(q)}&offset=${offset}`), enabled, placeholderData: (prev) => prev });
export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (vars: { id: string; role: Role }) => api<{ ok: true }>(`/users/${vars.id}/role`, { method: 'PATCH', body: { role: vars.role } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
}

export function relativeTime(iso: string | null, lang: string): string {
  if (!iso) return '?';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400 * 2) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/* ---------- Admin panel ---------- */

export interface AdminStats { users: number; active7: number; active30: number; lists: number; entries: number; friendships: number; pushDevices: number; raidAlerts7: number; errorsToday: number; openReports: number; signupsByWeek: { week: string; n: number }[] }
export interface SourceHealth { okAt: string | null; errorAt: string | null; error: string | null }
export interface AdminHealth { version: string; startedAt: string; dataset: DataStatus; sources: Partial<Record<'dataset' | 'research' | 'promo' | 'pvpoke' | 'raids' | 'feed', SourceHealth>> }
export interface AdminUserDetail { user: AdminUser & { lastSeenAt: string | null; suspendedAt: string | null }; counts: { lists: number; entries: number; friends: number; sessions: number; devices: number; pvp: number } }
export interface SignupSettings { mode: 'open' | 'invite' | 'closed'; dailyCap: number | null }
export interface Invite { id: string; note: string | null; maxUses: number; uses: number; expiresAt: string | null; createdAt: string }
export interface AuditEntry { id: string; actor: string | null; action: string; targetType: string; targetId: string | null; data: Record<string, unknown>; createdAt: string; undoneAt: string | null; undoable: boolean }
export interface Report { id: string; variantKey: string; kind: 'name' | 'released' | 'gender' | 'picture' | 'other'; message: string | null; status: 'open' | 'resolved' | 'dismissed'; by: string | null; createdAt: string; handledAt: string | null }
export interface Announcement { id: string; message: string; level: 'info' | 'warning'; link: string | null; active: boolean; createdAt: string; pushedAt: string | null; pushCount: number | null }

export const useAdminStats = () => useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<AdminStats>('/admin/stats') });
export const useAdminHealth = () => useQuery({ queryKey: ['admin', 'health'], queryFn: () => api<AdminHealth>('/admin/health'), refetchInterval: (q) => (q.state.data?.dataset.running ? 5000 : false) });
export const useAdminUser = (id: string | null) => useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`), enabled: !!id });
export const useSignups = () => useQuery({ queryKey: ['admin', 'signups'], queryFn: () => api<{ settings: SignupSettings; invites: Invite[] }>('/admin/signups') });
export const useAudit = (offset: number) => useQuery({ queryKey: ['admin', 'audit', offset], queryFn: () => api<{ entries: AuditEntry[]; offset: number }>(`/admin/audit?offset=${offset}`), placeholderData: (p) => p });
export const useReports = (status: 'open' | 'handled', enabled = true) => useQuery({ queryKey: ['reports', status], queryFn: () => api<{ reports: Report[] }>(`/reports?status=${status}`).then((r) => r.reports), enabled });
export const useAdminAnnouncements = () => useQuery({ queryKey: ['admin', 'announcements'], queryFn: () => api<{ announcements: Announcement[]; pushAccounts: number }>('/admin/announcements') });

/** Any admin call; refreshes the panel (and the user list) afterwards. */
export function useAdminAction<V>(call: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: () => {
      for (const k of [['admin'], ['users'], ['reports'], ['data-status'], ['announcement'], ['overrides'], ['dataset']]) void qc.invalidateQueries({ queryKey: k });
    },
  });
}
