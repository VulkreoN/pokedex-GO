import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { TYPES, effectiveness, type PokemonType, type PvpPokemon } from '@mydexpogo/shared';
import { LeagueIcon } from '../components/PvpTops.js';
import { Sprite } from '../components/Sprite.js';
import { TypeBadge } from '../components/TypeBadge.js';
import { Chip, Empty, Sheet, Spinner, TopBar } from '../components/ui.js';
import { normalize } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useMyPvp } from '../lib/myPvp.js';
import { LEAGUE_LIST, formOf, leagueName, usePopularTeams, usePvpRankings, type League, type RankedDetail } from '../lib/pvpoke.js';
import { picture, usePvp } from './PvpPage.js';

const SLOTS = 3;

/** A team of three for a league: shared type weaknesses, and what PvPoke says beats them or they beat. */
export function PvpTeamPage() {
  const t = useT();
  const { lang } = useLang();
  const { ds, pvp, byKey } = usePvp();
  const [params, setParams] = useSearchParams();
  const league: League = LEAGUE_LIST.find((l) => l === params.get('l')) ?? 'great';
  const keys = (params.get('p') ?? '').split(',').slice(0, SLOTS);
  const team = keys.map((k) => (k ? byKey.get(k) : undefined));
  const [picking, setPicking] = useState<number | null>(null);
  const setTeam = (next: (string | undefined)[]) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      const p = next.map((k) => k ?? '').join(',').replace(/,+$/, '');
      if (p) n.set('p', p);
      else n.delete('p');
      return n;
    }, { replace: true });
  const members = team.filter((p): p is PvpPokemon => !!p);

  // PvPoke's view of each member in this league: its key wins and losses.
  const details = useQueries({
    queries: [...new Set(members.map((m) => m.dex))].map((dex) => ({
      queryKey: ['game', 'pvp-rankings', dex],
      queryFn: () => fetch(`/api/game/pvp-rankings/${dex}`).then((r) => (r.ok ? r.json() : { rankings: [] })).then((r: { rankings: RankedDetail[] }) => r.rankings),
      staleTime: 3600_000,
    })),
  });
  const pvpokeOf = (m: PvpPokemon) =>
    pvp ? details.flatMap((d) => d.data ?? []).filter((r) => r.league === league && !r.shadow && formOf(pvp, r)?.key === m.key)[0] : undefined;

  if (ds.isPending) return <Spinner />;
  if (!pvp || !ds.data) return <Empty>{t.pvp_unavailable}</Empty>;
  const idx = ds.data;

  // Per attacking type: how many members take more damage from it, and how many take less.
  const types = TYPES.map((type) => {
    const mult = members.map((m) => effectiveness(type, m.types));
    return { type, weak: mult.filter((x) => x > 1).length, resist: mult.filter((x) => x < 1).length };
  });
  const shared = types.filter((x) => x.weak >= 2 && x.resist === 0);
  const uncovered = types.filter((x) => x.weak >= 1 && x.resist === 0 && x.weak < 2);

  const tally = (pick: (r: RankedDetail) => RankedDetail['wins']) => {
    const out = new Map<string, { ref: RankedDetail['wins'][number]; n: number }>();
    for (const m of members) for (const o of pick(pvpokeOf(m) ?? ({ wins: [], losses: [] } as unknown as RankedDetail))) {
      const k = `${o.speciesId}`;
      out.set(k, { ref: o, n: (out.get(k)?.n ?? 0) + 1 });
    }
    return [...out.values()].sort((a, b) => b.n - a.n);
  };
  const threats = tally((r) => r.losses);
  const beats = tally((r) => r.wins);

  return (
    <>
      <TopBar title={t.team_title} back />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {LEAGUE_LIST.map((l) => (
            <Chip key={l} active={league === l} onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); n.set('l', l); return n; }, { replace: true })}>
              <LeagueIcon league={l} size={16} />
              {leagueName(t, l)}
            </Chip>
          ))}
        </div>

        <ul className="grid grid-cols-3 gap-2">
          {Array.from({ length: SLOTS }, (_, i) => {
            const m = team[i];
            const v = m && picture(idx, m);
            return (
              <li key={i}>
                <button type="button" onClick={() => setPicking(i)} className={`card flex w-full flex-col items-center px-1 pb-2 pt-1 ${m ? '' : 'border-2 border-dashed border-line bg-transparent shadow-none'}`} aria-label={m ? `${t.team_change} ${localized(m.name, lang)}` : t.team_add}>
                  {m && v ? <Sprite idx={idx} variant={v} size={64} /> : <span className="flex h-16 items-center text-3xl text-ink-3">+</span>}
                  <span className="w-full truncate text-center text-[12px] font-semibold">{m ? localized(m.name, lang) : t.team_add}</span>
                  {m && <span className="mt-0.5 flex gap-0.5">{m.types.map((ty) => <TypeBadge key={ty} type={ty} small />)}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {members.length === 0 && <p className="mt-6 text-center text-sm text-ink-2">{t.team_intro}</p>}
        {members.length > 0 && (
          <Link to={`/pvp/battle?l=${league}&a=${encodeURIComponent(members[0]!.key)}`} className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-paper-2 text-sm font-semibold hover:brightness-95">{t.battle_open}</Link>
        )}

        {members.length > 0 && (
          <>
            <section className="card mt-4 p-3">
              <h2 className="text-base font-bold">{t.team_weak_title}</h2>
              {shared.length ? (
                <>
                  <p className="mt-1 text-xs text-ink-3">{t.team_weak_shared}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{shared.map((x) => <TypeBadge key={x.type} type={x.type} />)}</div>
                </>
              ) : (
                <p className="mt-1 text-sm text-go-ink dark:text-go">{t.team_weak_none}</p>
              )}
              {uncovered.length > 0 && (
                <>
                  <p className="mt-3 text-xs text-ink-3">{t.team_weak_single}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{uncovered.map((x) => <TypeBadge key={x.type} type={x.type} small />)}</div>
                </>
              )}
              <TypeGrid types={types} size={members.length} />
            </section>

            <Matchups title={t.team_threats} hint={t.team_threats_hint} list={threats} tone="berry" />
            <Matchups title={t.team_beats} hint={t.team_beats_hint} list={beats} tone="go" />
          </>
        )}
        <PopularTeams league={league} onLoad={(keys) => setTeam(keys)} />
      </main>
      <PickSheet open={picking !== null} league={league} onClose={() => setPicking(null)} onPick={(k) => { const next = [...team.map((m) => m?.key)]; next[picking!] = k; setTeam(next); setPicking(null); }} onClear={team[picking ?? -1] ? () => { const next = [...team.map((m) => m?.key)]; next[picking!] = undefined; setTeam(next); setPicking(null); } : undefined} />
    </>
  );

  function Matchups({ title, hint, list, tone }: { title: string; hint: string; list: { ref: RankedDetail['wins'][number]; n: number }[]; tone: 'berry' | 'go' }) {
    if (!list.length) return null;
    return (
      <section className="card mt-3 p-3">
        <h2 className="text-base font-bold">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{hint}</p>
        <ul className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-6">
          {list.slice(0, 12).map(({ ref, n }) => {
            const p = formOf(pvp!, ref);
            const v = p && picture(idx, p);
            return (
              <li key={ref.speciesId}>
                <Link to={p ? `/pvp/${encodeURIComponent(p.key)}` : '#'} className="relative flex flex-col items-center rounded-lg py-1 text-center hover:bg-paper-2">
                  {n > 1 && <span className={`tnum absolute right-1 top-0 rounded-md px-1 text-[10px] font-bold ${tone === 'berry' ? 'bg-berry/15 text-berry' : 'bg-go-soft text-go-ink'}`}>×{n}</span>}
                  {v && <Sprite idx={idx} variant={v} size={44} />}
                  <span className="w-full truncate text-[11px] font-semibold leading-tight">{p ? localized(p.name, lang).replace(/ \(.*\)$/, '') : ref.name}</span>
                  {ref.shadow && <span className="text-[10px] font-semibold leading-tight text-berry">{t.tag_shadow}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
}

/** Every attacking type, coloured by how the team takes it: red where members are weak and none resists. */
function TypeGrid({ types, size }: { types: { type: PokemonType; weak: number; resist: number }[]; size: number }) {
  const t = useT();
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold text-sky">{t.team_all_types}</summary>
      <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
        {types.map((x) => (
          <li key={x.type} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${x.weak > x.resist ? 'bg-berry/10' : x.resist > x.weak ? 'bg-go-soft' : 'bg-paper-2'}`}>
            <TypeBadge type={x.type} small />
            <span className="tnum ml-auto text-ink-2">{t.team_type_counts(x.weak, x.resist, size)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Choose a member: my saved Pokémon, PvPoke's top of the league, or a search. */
export function PickSheet({ open, league, onClose, onPick, onClear }: { open: boolean; league: League; onClose: () => void; onPick: (key: string) => void; onClear?: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const { ds, pvp, byKey } = usePvp();
  const mine = useMyPvp();
  const rankings = usePvpRankings();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    if (!pvp) return [];
    const nq = normalize(q);
    if (nq) return pvp.pokemon.filter((p) => normalize(`${p.dex} ${p.name.en} ${p.name.fr ?? ''}`).includes(nq)).slice(0, 30);
    const seen = new Set<string>();
    const out: PvpPokemon[] = [];
    for (const m of mine.data ?? []) { const p = byKey.get(m.formKey); if (p && !seen.has(p.key)) { seen.add(p.key); out.push(p); } }
    for (const r of rankings.data?.[league] ?? []) { const p = formOf(pvp, r); if (p && !seen.has(p.key)) { seen.add(p.key); out.push(p); } if (out.length >= 30) break; }
    return out;
  }, [pvp, q, mine.data, rankings.data, league, byKey]);
  return (
    <Sheet open={open} onClose={onClose} title={t.team_pick}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.pvp_search} aria-label={t.pvp_search} className="mb-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] placeholder:text-ink-3" />
      {!q && <p className="mb-2 text-xs text-ink-3">{t.team_pick_hint}</p>}
      <ul className="grid grid-cols-4 gap-1.5">
        {ds.data && list.map((p) => {
          const v = picture(ds.data!, p);
          return (
            <li key={p.key}>
              <button type="button" onClick={() => { setQ(''); onPick(p.key); }} className="flex w-full flex-col items-center rounded-lg py-1 hover:bg-paper-2">
                {v && <Sprite idx={ds.data!} variant={v} size={48} />}
                <span className="w-full truncate text-center text-[11px] font-semibold">{localized(p.name, lang)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {onClear && <button type="button" onClick={onClear} className="mt-3 w-full rounded-xl py-2 text-sm font-semibold text-berry hover:bg-berry/10">{t.team_remove}</button>}
    </Sheet>
  );
}

/** The most played teams of the league on PvPoke's training mode, ready to load. */
function PopularTeams({ league, onLoad }: { league: League; onLoad: (keys: string[]) => void }) {
  const t = useT();
  const { lang } = useLang();
  const { ds, pvp } = usePvp();
  const q = usePopularTeams(league);
  if (!pvp || !ds.data || !q.data?.teams.length) return null;
  const idx = ds.data;
  return (
    <section className="mt-5">
      <h2 className="text-base font-bold">{t.team_popular}</h2>
      <p className="mt-0.5 text-xs text-ink-3">{t.team_popular_hint(q.data.updated && !Number.isNaN(Date.parse(q.data.updated)) ? new Date(q.data.updated).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) : q.data.updated)}</p>
      <ul className="mt-2 space-y-2">
        {q.data.teams.map((team, i) => {
          const forms = team.members.map((m) => ({ m, p: formOf(pvp, m) }));
          if (forms.some((x) => !x.p)) return null;
          return (
            <li key={i}>
              <button type="button" onClick={() => onLoad(forms.map((x) => x.p!.key))} className="card flex w-full items-center gap-2 p-2 text-left hover:brightness-[0.98]">
                <span className="grid flex-1 grid-cols-3 gap-1">
                  {forms.map(({ m, p }) => {
                    const v = picture(idx, p!);
                    return (
                      <span key={m.speciesId} className="flex min-w-0 flex-col items-center">
                        {v && <Sprite idx={idx} variant={v} size={44} />}
                        <span className="w-full truncate text-center text-[11px] font-semibold leading-tight">{localized(p!.name, lang).replace(/ \(.*\)$/, '')}</span>
                        {m.shadow && <span className="text-[10px] font-semibold leading-tight text-berry">{t.tag_shadow}</span>}
                      </span>
                    );
                  })}
                </span>
                <span className="tnum shrink-0 text-right text-xs text-ink-3">{t.team_games(team.games)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
