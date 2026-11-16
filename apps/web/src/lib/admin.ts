import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalizedText, Role } from '@mydexpogo/shared';
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
export interface Override { variantKey: string; released: boolean | null; label: LocalizedText | null; updatedBy: string | null; updatedAt: string }

export const useDataStatus = () => useQuery({ queryKey: ['data-status'], queryFn: () => api<DataStatus>('/data/status'), refetchInterval: (q) => (q.state.data?.running ? 5000 : false) });

export const useOverrides = (enabled: boolean) =>
  useQuery({ queryKey: ['overrides'], queryFn: () => api<{ overrides: Override[] }>('/overrides').then((r) => r.overrides), enabled });

export function useSetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { variantKey: string; released?: boolean | null; label?: LocalizedText | null }) =>
      api<{ ok: true }>(`/overrides/${vars.variantKey}`, { method: 'PUT', body: { released: vars.released ?? null, label: vars.label ?? null } }),
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
