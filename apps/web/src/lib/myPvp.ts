/** "My PvP Pokémon" and saved PvP teams: kept server-side per player, private. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PvpLeague, PvpTeam } from '@mydexpogo/shared';
import { api } from './api.js';
import { useMe } from './auth.js';

export interface MyPvpPokemon { id: string; formKey: string; atk: number; def: number; sta: number; level: number | null; shadow: boolean; note: string | null; createdAt: string }
export type MyPvpInput = Pick<MyPvpPokemon, 'formKey' | 'atk' | 'def' | 'sta' | 'level'> & { shadow?: boolean; note?: string | null };

const KEY = ['pvp-pokemon'];
const TEAMS_KEY = ['pvp-teams'];

export function useMyPvp() {
  const me = useMe();
  return useQuery({ queryKey: KEY, queryFn: () => api<{ pokemon: MyPvpPokemon[] }>('/pvp-pokemon').then((r) => r.pokemon), enabled: !!me.data });
}

export function useSaveMyPvp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: MyPvpInput & { id?: string }) =>
      p.id
        ? api<{ pokemon: MyPvpPokemon }>(`/pvp-pokemon/${p.id}`, { method: 'PATCH', body: { atk: p.atk, def: p.def, sta: p.sta, level: p.level, shadow: p.shadow } })
        : api<{ pokemon: MyPvpPokemon }>('/pvp-pokemon', { body: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteMyPvp() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/pvp-pokemon/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export function usePvpTeams() {
  const me = useMe();
  return useQuery({ queryKey: TEAMS_KEY, queryFn: () => api<{ teams: PvpTeam[] }>('/pvp-teams').then((r) => r.teams), enabled: !!me.data });
}

export function useSavePvpTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; league: PvpLeague; members: string[]; note?: string | null }) =>
      api<{ team: PvpTeam }>('/pvp-teams', { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEAMS_KEY }),
  });
}

export function useUpdatePvpTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; name?: string; league?: PvpLeague; members?: string[]; note?: string | null }) =>
      api<{ team: PvpTeam }>(`/pvp-teams/${vars.id}`, { method: 'PATCH', body: { name: vars.name, league: vars.league, members: vars.members, note: vars.note } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEAMS_KEY }),
  });
}

export function useDeletePvpTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/pvp-teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEAMS_KEY }),
  });
}
