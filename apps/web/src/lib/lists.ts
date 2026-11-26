import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntryGender, FriendRequest, ListDetail, ListEntry, ListSummary, ListVisibility, MembershipEntry, PublicUser, TradeMatch } from '@mydexpogo/shared';

/** What the app sends: no gender = every gender the Pokémon exists in (the server checks against the game master). */
export type EntryInput = Omit<ListEntry, 'note' | 'gender'> & { gender?: EntryGender; note?: string | null };
import { api } from './api.js';

export type ListAccess = 'owner' | 'friend' | 'link';
export type Friend = PublicUser & { since: string; favorite?: boolean; lists?: number };

export const useLists = () => useQuery({ queryKey: ['lists'], queryFn: () => api<{ lists: ListSummary[] }>('/lists').then((r) => r.lists) });

export const useMembership = (enabled = true) =>
  useQuery({ queryKey: ['lists-membership'], queryFn: () => api<{ entries: MembershipEntry[] }>('/lists/membership').then((r) => r.entries), enabled });

export const useList = (id: string, enabled = true) =>
  useQuery({ queryKey: ['list', id], queryFn: () => api<{ list: ListDetail; access: ListAccess; following?: boolean }>(`/lists/${id}`), enabled: enabled && !!id });

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
    (body: { name: string; description?: string | null; visibility?: ListVisibility; alertPreEvolutions?: boolean }) => api<{ list: ListDetail }>('/lists', { body }),
    () => [['lists'], ['lists-membership']],
  );

export const useUpdateList = (id: string) =>
  useListMutation(
    (body: { name?: string; description?: string | null; visibility?: ListVisibility; alertPreEvolutions?: boolean }) => api<{ list: ListDetail }>(`/lists/${id}`, { method: 'PATCH', body }),
    () => [['lists'], ['list', id], ['lists-membership']],
  );

export const useDeleteList = () =>
  useListMutation((id: string) => api<{ ok: true }>(`/lists/${id}`, { method: 'DELETE' }), () => [['lists'], ['lists-membership'], ['friend-matches']]);

export const useUpsertEntries = () =>
  useListMutation(
    (vars: { id: string; entries: EntryInput[] }) => api<{ list: ListDetail }>(`/lists/${vars.id}/entries`, { method: 'PUT', body: { entries: vars.entries } }),
    (vars) => [['lists'], ['list', vars.id], ['lists-membership'], ['friend-matches']],
  );

export const useRemoveEntries = () =>
  useListMutation(
    (vars: { id: string; entries: { variantKey: string; gender?: EntryGender; shiny: boolean; tag: ListEntry['tag'] }[] }) => api<{ list: ListDetail }>(`/lists/${vars.id}/entries`, { method: 'DELETE', body: { entries: vars.entries } }),
    (vars) => [['lists'], ['list', vars.id], ['lists-membership'], ['friend-matches']],
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
    () => [['lists'], ['lists-membership']],
  );

export const useFriends = () => useQuery({ queryKey: ['friends'], queryFn: () => api<{ friends: Friend[] }>('/friends').then((r) => r.friends) });
export const useFriendRequests = () =>
  useQuery({ queryKey: ['friend-requests'], queryFn: () => api<{ requests: FriendRequest[] }>('/friends/requests').then((r) => r.requests) });
export const useFriendLists = (id: string) =>
  useQuery({ queryKey: ['friend-lists', id], queryFn: () => api<{ friend: PublicUser; lists: ListSummary[] }>(`/friends/${id}/lists`) });
export const useFriendMatches = (id: string, enabled = true) =>
  useQuery({ queryKey: ['friend-matches', id], queryFn: () => api<{ friend: PublicUser; iHaveForThem: TradeMatch[]; theyHaveForMe: TradeMatch[] }>(`/friends/${id}/matches`), enabled: enabled && !!id });

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
/** My collections in a new order: shown at once, saved behind. */
export function useReorderLists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api<{ lists: ListSummary[] }>('/lists/order', { method: 'PUT', body: { ids } }),
    onMutate: (ids) => {
      const before = qc.getQueryData<ListSummary[]>(['lists']);
      if (before) qc.setQueryData(['lists'], ids.map((id) => before.find((l) => l.id === id)).filter(Boolean));
      return { before };
    },
    onError: (_e, _ids, ctx) => ctx?.before && qc.setQueryData(['lists'], ctx.before),
    onSuccess: (r) => qc.setQueryData(['lists'], r.lists),
  });
}

export const usePinFriend = () =>
  useListMutation((v: { id: string; on: boolean }) => api<{ ok: true }>(`/friends/${v.id}/favorite`, { method: 'PUT', body: { on: v.on } }), () => [['friends'], ['friends-lists']]);
export const usePinList = () =>
  useListMutation((v: { id: string; on: boolean }) => api<{ ok: true }>(`/lists/${v.id}/favorite`, { method: 'PUT', body: { on: v.on } }), () => [['friends-lists']]);

export const useRemoveFriend = () => useListMutation((id: string) => api<{ ok: true }>(`/friends/${id}`, { method: 'DELETE' }), () => [['friends']]);
