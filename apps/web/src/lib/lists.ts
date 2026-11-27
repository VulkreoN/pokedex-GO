import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntryGender, FriendRequest, ListDetail, ListEntry, ListSummary, ListVisibility, MembershipEntry, PostcardFriendSuggestion, PublicUser, UserPostcard, VivillonPattern } from '@mydexpogo/shared';

/** What the app sends: no gender = every gender the Pokémon exists in (the server checks against the game master). */
export type EntryInput = Omit<ListEntry, 'note' | 'gender'> & { gender?: EntryGender; note?: string | null };
import { api } from './api.js';

export type ListAccess = 'owner' | 'friend' | 'link';
export type Friend = PublicUser & { since: string; favorite?: boolean; lucky?: boolean; lists?: number; postcards?: UserPostcard[] };
export interface FriendProfileStats {
  friendsCount: number;
  pvpCount: number;
  completedLists: number;
  entries: Pick<MembershipEntry, 'variantKey' | 'shiny' | 'tag' | 'done'>[];
}

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
  useListMutation((id: string) => api<{ ok: true }>(`/lists/${id}`, { method: 'DELETE' }), () => [['lists'], ['lists-membership'], ['postcards-discover']]);

export const useUpsertEntries = () =>
  useListMutation(
    (vars: { id: string; entries: EntryInput[]; insertOnly?: boolean }) =>
      api<{ list: ListDetail }>(`/lists/${vars.id}/entries`, {
        method: 'PUT',
        body: { entries: vars.entries, ...(vars.insertOnly ? { insertOnly: true } : {}) },
      }),
    (vars) => [['lists'], ['list', vars.id], ['lists-membership'], ['postcards-discover']],
  );

export const useRemoveEntries = () =>
  useListMutation(
    (vars: { id: string; entries: { variantKey: string; gender?: EntryGender; shiny: boolean; tag: ListEntry['tag'] }[] }) => api<{ list: ListDetail }>(`/lists/${vars.id}/entries`, { method: 'DELETE', body: { entries: vars.entries } }),
    (vars) => [['lists'], ['list', vars.id], ['lists-membership'], ['postcards-discover']],
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
export const useFriendRequests = (enabled = true) =>
  useQuery({ queryKey: ['friend-requests'], queryFn: () => api<{ requests: FriendRequest[] }>('/friends/requests').then((r) => r.requests), enabled });
export const useFriendLists = (id: string) =>
  useQuery({
    queryKey: ['friend-lists', id],
    queryFn: () =>
      api<{
        friend: PublicUser & { since?: string; favorite?: boolean; lucky?: boolean; postcards?: UserPostcard[] };
        lists: ListSummary[];
        profile?: FriendProfileStats;
      }>(`/friends/${id}/lists`),
  });

export const useMyPostcards = (enabled = true) =>
  useQuery({ queryKey: ['my-postcards'], queryFn: () => api<{ postcards: UserPostcard[] }>('/friends/postcards').then((r) => r.postcards), enabled });

export const useSavePostcards = () =>
  useListMutation(
    (postcards: UserPostcard[]) => api<{ postcards: UserPostcard[] }>('/friends/postcards', { method: 'PUT', body: { postcards } }),
    () => [['my-postcards'], ['postcards-discover']],
  );

export const useDiscoverPostcards = (opts: { patterns?: VivillonPattern[]; all?: boolean } = {}, enabled = true) => {
  const qs = new URLSearchParams();
  if (opts.all) qs.set('all', '1');
  else if (opts.patterns?.length) qs.set('patterns', opts.patterns.join(','));
  const query = qs.toString();
  return useQuery({
    queryKey: ['postcards-discover', query],
    queryFn: () => api<{ wantedPatterns: VivillonPattern[]; suggestions: PostcardFriendSuggestion[] }>(`/friends/postcards/discover${query ? `?${query}` : ''}`),
    enabled,
  });
};

export const useSendFriendRequest = () =>
  useListMutation(
    (friendCode: string) => api<{ accepted: boolean; friend?: PublicUser; to?: PublicUser }>('/friends/requests', { body: { friendCode } }),
    () => [['friends'], ['friend-requests'], ['postcards-discover']],
  );
export const useRespondFriendRequest = () =>
  useListMutation(
    (vars: { id: string; action: 'accept' | 'decline' }) => api<{ ok: true }>(`/friends/requests/${vars.id}/${vars.action}`, { method: 'POST' }),
    () => [['friends'], ['friend-requests'], ['postcards-discover']],
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
  useListMutation((v: { id: string; on: boolean }) => api<{ ok: true }>(`/friends/${v.id}/favorite`, { method: 'PUT', body: { on: v.on } }), (v) => [['friends'], ['friends-lists'], ['friend-lists', v.id]]);
export const useLuckyFriend = () =>
  useListMutation((v: { id: string; on: boolean }) => api<{ ok: true }>(`/friends/${v.id}/lucky`, { method: 'PUT', body: { on: v.on } }), (v) => [['friends'], ['friend-lists', v.id]]);
export const usePinList = () =>
  useListMutation((v: { id: string; on: boolean }) => api<{ ok: true }>(`/lists/${v.id}/favorite`, { method: 'PUT', body: { on: v.on } }), () => [['friends-lists']]);

export const useRemoveFriend = () => useListMutation((id: string) => api<{ ok: true }>(`/friends/${id}`, { method: 'DELETE' }), () => [['friends'], ['postcards-discover']]);
