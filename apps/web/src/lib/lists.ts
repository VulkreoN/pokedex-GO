import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FriendRequest, ListDetail, ListEntry, ListSummary, ListVisibility, PublicUser } from '@mydexpogo/shared';
import { api } from './api.js';

export type ListAccess = 'owner' | 'friend' | 'link';
export type Friend = PublicUser & { since: string };

export const useLists = () => useQuery({ queryKey: ['lists'], queryFn: () => api<{ lists: ListSummary[] }>('/lists').then((r) => r.lists) });

export const useList = (id: string) =>
  useQuery({ queryKey: ['list', id], queryFn: () => api<{ list: ListDetail; access: ListAccess }>(`/lists/${id}`) });

export const useSharedList = (token: string) =>
  useQuery({ queryKey: ['shared', token], queryFn: () => api<{ list: ListDetail; access: ListAccess }>(`/shared/${token}`) });

function useListMutation<TVars, TRes>(fn: (vars: TVars) => Promise<TRes>, keys: (vars: TVars, res: TRes) => unknown[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res, vars) => {
      for (const k of keys(vars, res)) qc.invalidateQueries({ queryKey: k });
    },
  });
}

export const useCreateList = () =>
  useListMutation(
    (body: { name: string; description?: string | null; visibility?: ListVisibility }) => api<{ list: ListDetail }>('/lists', { body }),
    () => [['lists']],
  );

export const useUpdateList = (id: string) =>
  useListMutation(
    (body: { name?: string; description?: string | null; visibility?: ListVisibility }) => api<{ list: ListDetail }>(`/lists/${id}`, { method: 'PATCH', body }),
    () => [['lists'], ['list', id]],
  );

export const useDeleteList = () =>
  useListMutation((id: string) => api<{ ok: true }>(`/lists/${id}`, { method: 'DELETE' }), () => [['lists']]);

export const useUpsertEntries = () =>
  useListMutation(
    (vars: { id: string; entries: Omit<ListEntry, 'note'>[] | ListEntry[] }) => api<{ list: ListDetail }>(`/lists/${vars.id}/entries`, { method: 'PUT', body: { entries: vars.entries } }),
    (vars) => [['lists'], ['list', vars.id]],
  );

export const useRemoveEntries = () =>
  useListMutation(
    (vars: { id: string; entries: { variantKey: string; shiny: boolean; tag: ListEntry['tag'] }[] }) => api<{ list: ListDetail }>(`/lists/${vars.id}/entries`, { method: 'DELETE', body: { entries: vars.entries } }),
    (vars) => [['lists'], ['list', vars.id]],
  );

export const useShareList = () =>
  useListMutation(
    (vars: { id: string; on: boolean }) =>
      api<{ shareToken?: string }>(`/lists/${vars.id}/share`, { method: vars.on ? 'POST' : 'DELETE' }),
    (vars) => [['lists'], ['list', vars.id]],
  );

export const useCopyList = () =>
  useListMutation(
    (vars: { id?: string; token?: string }) => api<{ list: ListDetail }>(vars.token ? `/shared/${vars.token}/copy` : `/lists/${vars.id}/copy`, { method: 'POST' }),
    () => [['lists']],
  );

export const useFriends = () => useQuery({ queryKey: ['friends'], queryFn: () => api<{ friends: Friend[] }>('/friends').then((r) => r.friends) });
export const useFriendRequests = () =>
  useQuery({ queryKey: ['friend-requests'], queryFn: () => api<{ requests: FriendRequest[] }>('/friends/requests').then((r) => r.requests) });
export const useFriendLists = (id: string) =>
  useQuery({ queryKey: ['friend-lists', id], queryFn: () => api<{ friend: PublicUser; lists: ListSummary[] }>(`/friends/${id}/lists`) });

export const useSendFriendRequest = () =>
  useListMutation(
    (friendCode: string) => api<{ accepted: boolean; friend?: PublicUser; to?: PublicUser }>('/friends/requests', { body: { friendCode } }),
    () => [['friends'], ['friend-requests']],
  );
export const useRespondFriendRequest = () =>
  useListMutation(
    (vars: { id: string; action: 'accept' | 'decline' }) => api<{ ok: true }>(`/friends/requests/${vars.id}/${vars.action}`, { method: 'POST' }),
    () => [['friends'], ['friend-requests']],
  );
export const useRemoveFriend = () => useListMutation((id: string) => api<{ ok: true }>(`/friends/${id}`, { method: 'DELETE' }), () => [['friends']]);
