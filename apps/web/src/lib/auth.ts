import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@mydexpogo/shared';
import { api } from './api.js';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: PublicUser | null }>('/auth/me').then((r) => r.user),
    staleTime: 60_000,
  });
}

export function useAuthMutation(kind: 'login' | 'register') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) => api<{ user: PublicUser }>(`/auth/${kind}`, { body }),
    onSuccess: (r) => {
      qc.setQueryData(['me'], r.user);
      qc.invalidateQueries();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'dataset' && q.queryKey[0] !== 'me' });
    },
  });
}
