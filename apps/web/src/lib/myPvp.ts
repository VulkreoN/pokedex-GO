/** "My PvP Pokémon": the player's own Pokémon kept with their IVs (server side, private). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { useMe } from './auth.js';

export interface MyPvpPokemon { id: string; formKey: string; atk: number; def: number; sta: number; level: number | null; shadow: boolean; note: string | null; createdAt: string }
export type MyPvpInput = Pick<MyPvpPokemon, 'formKey' | 'atk' | 'def' | 'sta' | 'level'> & { note?: string | null };

const KEY = ['pvp-pokemon'];

export function useMyPvp() {
  const me = useMe();
  return useQuery({ queryKey: KEY, queryFn: () => api<{ pokemon: MyPvpPokemon[] }>('/pvp-pokemon').then((r) => r.pokemon), enabled: !!me.data });
}

export function useSaveMyPvp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: MyPvpInput & { id?: string }) =>
      p.id ? api<{ pokemon: MyPvpPokemon }>(`/pvp-pokemon/${p.id}`, { method: 'PATCH', body: { atk: p.atk, def: p.def, sta: p.sta, level: p.level } }) : api<{ pokemon: MyPvpPokemon }>('/pvp-pokemon', { body: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteMyPvp() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/pvp-pokemon/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
