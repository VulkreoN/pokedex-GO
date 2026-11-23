import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LEAGUES, cpOf, cpmAt, ivSearch, levelSteps, levelsForCp, powerUpCost, rankOf, rankTable, type Ivs, type PvpData, type PvpPokemon, type RankInfo, type Variant } from '@mydexpogo/shared';
import { Sprite } from '../components/Sprite.js';
import { LeagueIcon } from '../components/PvpTops.js';
import { PvpokeCard } from '../components/PvpokeCard.js';
import { PVPOKE_URL, formOf, pvpokeRanks, usePvpRankings, type League, type RankedPokemon } from '../lib/pvpoke.js';
import { TypeBadge } from '../components/TypeBadge.js';
import { Button, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import { copyText } from '../lib/api.js';
import { savedGameLang } from '../lib/searchString.js';
import { useMe } from '../lib/auth.js';
import { useDeleteMyPvp, useMyPvp, useSaveMyPvp, type MyPvpPokemon } from '../lib/myPvp.js';
import { normalize, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';

/** IV floors by how the Pokémon was obtained: they shrink the pool a rank is computed against. */
const FLOORS = [0, 4, 5, 10, 12] as const;

function usePvp() {
  const ds = useDataset();
  const pvp = ds.data?.ds.pvp;
  const byKey = useMemo(() => new Map((pvp?.pokemon ?? []).map((p) => [p.key, p])), [pvp]);
  return { ds, pvp, byKey };
}

function picture(idx: DatasetIndex, p: PvpPokemon): Variant | undefined {
  return idx.variantByKey.get(p.key) ?? idx.coverOf.get(p.dex);
}

/** Great and Ultra League regulars, offered when PvPoke's rankings cannot be loaded. */
const POPULAR_DEX = [184, 308, 334, 379, 260, 227, 195, 362, 423, 340];
/** Last forms opened on this device, newest first. */
function recentPvp(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem('pvpRecent') ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function rememberPvp(key: string) {
  try {
    localStorage.setItem('pvpRecent', JSON.stringify([key, ...recentPvp().filter((k) => k !== key)].slice(0, 8)));
  } catch {}
}

export function PvpPage() {
  const { key } = useParams();
  return key ? <PvpDetail pkey={decodeURIComponent(key)} /> : <PvpSearch />;
}

function PvpSearch() {
  const t = useT();
  const { lang } = useLang();
  const { ds, pvp, byKey } = usePvp();
  const [query, setQuery] = useState('');
  const rankings = usePvpRankings();
  const [league, setLeague] = useState<League>('great');
  const picks = useMemo(() => {
    if (!pvp) return { recent: [], popular: [], top: [] };
    const recent = recentPvp().flatMap((k) => byKey.get(k) ?? []);
    const popular = POPULAR_DEX.flatMap((dex) => byKey.get(String(dex)) ?? pvp.pokemon.find((p) => p.dex === dex) ?? []).filter((p) => !recent.includes(p));
    const top = (rankings.data?.[league] ?? []).slice(0, 20).flatMap((r) => {
      const p = formOf(pvp, r);
      return p ? [{ p, r }] : [];
    });
    return { recent, popular, top };
  }, [pvp, byKey, rankings.data, league]);
  const tile = (p: PvpPokemon, r?: RankedPokemon) => {
    const v = ds.data && picture(ds.data, p);
    return (
      <li key={r ? r.speciesId : p.key}>
        <Link to={`/pvp/${encodeURIComponent(p.key)}`} className="card relative flex flex-col items-center px-1 pb-2 pt-1 hover:brightness-[0.98]">
          {r && <span className="tnum absolute left-1.5 top-1 text-[11px] font-bold text-ink-3">#{r.rank}</span>}
          {v && ds.data && <Sprite idx={ds.data} variant={v} size={60} />}
          {(() => {
            // "Corayon (de Galar)": the form on a line of its own, small tiles cut long names.
            const [, base, form] = /^(.*?)(?: \((.*)\))?$/.exec(localized(p.name, lang))!;
            return (
              <>
                <span className="w-full truncate text-center text-[12px] font-semibold">{base}</span>
                {form && <span className="w-full truncate text-center text-[10px] leading-tight text-ink-3">{form}</span>}
              </>
            );
          })()}
          {r?.shadow && <span className="text-[10px] font-semibold leading-tight text-berry">{t.tag_shadow}</span>}
        </Link>
      </li>
    );
  };
  const results = useMemo(() => {
    const q = normalize(query);
    if (!q || !pvp) return [];
    return pvp.pokemon.filter((p) => normalize(`${p.dex} ${p.name.en} ${p.name.fr ?? ''}`).includes(q)).slice(0, 60);
  }, [query, pvp]);
  return (
    <>
      <TopBar title={t.nav_pvp}>
        <div className="mx-auto max-w-3xl px-3 pb-2">
          <input
            type="search"
            inputMode="search"
            autoFocus
            placeholder={t.pvp_search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border px-3 text-[16px] shadow-card placeholder:text-ink-3 focus:outline-none"
            aria-label={t.pvp_search}
          />
        </div>
      </TopBar>
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-3">
        {ds.isPending && <Spinner />}
        {ds.data && !pvp && <Empty>{t.pvp_unavailable}</Empty>}
        {pvp && !query && (
          <>
            <p className="mb-4 text-sm text-ink-2">{t.pvp_intro}</p>
            {ds.data && <MyPokemon idx={ds.data} pvp={pvp} byKey={byKey} />}
            {picks.recent.length > 0 && (
              <section className="mb-5">
                <h2 className="mb-2 text-base font-bold">{t.pvp_recent}</h2>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">{picks.recent.map((p) => tile(p))}</ul>
              </section>
            )}
            {picks.top.length > 0 ? (
              <section>
                <h2 className="mb-2 text-base font-bold">{t.pvp_top}</h2>
                <div className="mb-2 flex gap-2">
                  {(['great', 'ultra'] as League[]).map((l) => (
                    <Chip key={l} active={league === l} onClick={() => setLeague(l)}>
                      <LeagueIcon league={l} size={16} />
                      {l === 'great' ? t.league_great : t.league_ultra}
                    </Chip>
                  ))}
                </div>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">{picks.top.map(({ p, r }) => tile(p, r))}</ul>
                <p className="mt-2 text-xs text-ink-3">
                  {t.pvp_source} <a href={PVPOKE_URL} target="_blank" rel="noreferrer" className="font-semibold text-sky">PvPoke</a>
                </p>
              </section>
            ) : (
              <section>
                <h2 className="mb-2 text-base font-bold">{t.pvp_popular}</h2>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">{picks.popular.map((p) => tile(p))}</ul>
              </section>
            )}
          </>
        )}
        {pvp && query && results.length === 0 && <Empty>{t.nothing_here}</Empty>}
        <ul className="space-y-2">
          {ds.data &&
            results.map((p) => {
              const v = picture(ds.data, p);
              return (
                <li key={p.key}>
                  <Link to={`/pvp/${encodeURIComponent(p.key)}`} className="card flex items-center gap-3 p-2 hover:brightness-[0.98]">
                    {v && <Sprite idx={ds.data} variant={v} size={52} />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{localized(p.name, lang)}</div>
                      <div className="mt-1 flex gap-1">{p.types.map((ty) => <TypeBadge key={ty} type={ty} small />)}</div>
                    </div>
                    <div className="tnum shrink-0 text-right text-xs text-ink-3">#{p.dex}</div>
                  </Link>
                </li>
              );
            })}
        </ul>
      </main>
    </>
  );
}

/** This form and everything it can evolve into: level carries over when evolving, so one set of IVs covers the line. */
function evolutionLine(start: PvpPokemon, byKey: Map<string, PvpPokemon>): PvpPokemon[] {
  const out: PvpPokemon[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    out.push(p);
    for (const k of p.evolutions ?? []) {
      const next = byKey.get(k);
      if (next) queue.push(next);
    }
  }
  return out;
}

const clampIv = (v: string | null) => Math.min(15, Math.max(0, Number(v ?? 0) || 0));

function PvpDetail({ pkey }: { pkey: string }) {
  const t = useT();
  const { lang } = useLang();
  const navigate = useNavigate();
  const { ds, pvp, byKey } = usePvp();
  const rankings = usePvpRankings();
  const [params, setParams] = useSearchParams();
  const [cpInput, setCpInput] = useState('');
  const iv: Ivs = { atk: clampIv(params.get('a')), def: clampIv(params.get('d')), sta: clampIv(params.get('s')) };
  const level = params.get('l') ? Number(params.get('l')) : null;
  const floor = Number(params.get('f') ?? 0);
  const buddy = params.get('b') === '1';
  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
      return next;
    }, { replace: true });

  const me = byKey.get(pkey);
  useEffect(() => {
    if (me) rememberPvp(me.key);
  }, [me]);
  if (ds.isPending) return <Spinner />;
  if (!pvp || !me || !ds.data) {
    return (
      <>
        <TopBar title={t.nav_pvp} back />
        <Empty>{t.nothing_here}</Empty>
      </>
    );
  }
  const maxLevel = pvp.maxLevel + (buddy ? 1 : 0);
  const line = evolutionLine(me, byKey);
  const cpLevels = cpInput ? levelsForCp(pvp, me, iv, Number(cpInput), pvp.maxLevel + 1) : [];
  const meVariant = picture(ds.data, me);

  return (
    <>
      <TopBar title={localized(me.name, lang)} back />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-3">
        <section className="card p-3">
          <div className="flex items-center gap-3">
            {meVariant && <Sprite idx={ds.data} variant={meVariant} size={80} />}
            <div className="min-w-0 flex-1">
              <div className="flex gap-1">{me.types.map((ty) => <TypeBadge key={ty} type={ty} />)}</div>
              <div className="tnum mt-1 text-xs text-ink-2">
                {t.stat_atk} {me.atk} · {t.stat_def} {me.def} · {t.stat_sta} {me.sta}
              </div>
              {(() => {
                const ranks = pvpokeRanks(pvp, rankings.data, me.key);
                return ranks.length ? (
                  <a href={PVPOKE_URL} target="_blank" rel="noreferrer" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-2" title={t.pvp_pvpoke_rank}>
                    <span className="font-semibold">PvPoke</span>
                    {ranks.map((r) => (
                      <span key={`${r.league}${r.shadow}`} className="tnum inline-flex items-center gap-1">
                        <LeagueIcon league={r.league} size={13} />
                        {t.pvp_rank_in(r.league === 'great' ? t.league_great : t.league_ultra, r.rank, r.shadow)}
                      </span>
                    ))}
                  </a>
                ) : null;
              })()}
            </div>
            <button type="button" onClick={() => navigate('/pvp')} className="shrink-0 text-sm font-semibold text-sky">{t.pvp_change}</button>
          </div>

          <h2 className="mt-4 text-sm font-semibold text-ink-2">{t.pvp_your_ivs}</h2>
          <div className="mt-2 space-y-2">
            <IvSlider label={t.stat_atk} value={iv.atk} onChange={(v) => set({ a: String(v) })} />
            <IvSlider label={t.stat_def} value={iv.def} onChange={(v) => set({ d: String(v) })} />
            <IvSlider label={t.stat_sta} value={iv.sta} onChange={(v) => set({ s: String(v) })} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-2">{t.pvp_level_now}</span>
              <select
                value={level ?? ''}
                onChange={(e) => set({ l: e.target.value || null })}
                className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] text-ink"
              >
                <option value="">{t.pvp_level_unknown}</option>
                {levelSteps(pvp.maxLevel + 1).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-2">{t.pvp_or_cp}</span>
              <input
                type="number"
                inputMode="numeric"
                min={10}
                value={cpInput}
                placeholder="PC"
                onChange={(e) => {
                  setCpInput(e.target.value);
                  const found = e.target.value ? levelsForCp(pvp, me, iv, Number(e.target.value), pvp.maxLevel + 1) : [];
                  if (found.length >= 1) set({ l: String(found[0]) });
                }}
                className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] text-ink placeholder:text-ink-3"
              />
            </label>
          </div>
          {cpInput && (
            <p className="mt-1 text-xs text-ink-3">
              {cpLevels.length === 0 ? t.pvp_cp_nomatch : cpLevels.length === 1 ? t.pvp_cp_level(cpLevels[0]!) : t.pvp_cp_levels(cpLevels.join(', '))}
            </p>
          )}

          {/* Rarely changed: folded, with the current choice in view. */}
          <details className="mt-3 rounded-xl bg-paper-2 px-3 py-2" open={floor > 0 || buddy}>
            <summary className="cursor-pointer text-sm font-medium text-ink-2">
              {t.pvp_floor} : <span className="font-semibold text-ink">{t[`pvp_floor_${floor as 0}`]}</span>
              {buddy && <span className="font-semibold text-ink"> · {t.pvp_buddy}</span>}
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FLOORS.map((f) => (
                <Chip key={f} active={floor === f} onClick={() => set({ f: f ? String(f) : null })} className="min-h-8 px-2.5 text-xs">{t[`pvp_floor_${f}`]}</Chip>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">{t.pvp_floor_hint}</p>
            <label className="mt-2 flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={buddy} onChange={(e) => set({ b: e.target.checked ? '1' : null })} className="h-5 w-5 accent-[var(--go)]" />
              {t.pvp_buddy}
            </label>
          </details>
          <SaveMine me={me} iv={iv} level={level} mineId={params.get('m')} onSaved={(id) => set({ m: id })} onRemoved={() => set({ m: null })} />
        </section>

        <Results me={me} line={line} idx={ds.data} pvp={pvp} iv={iv} level={level} floor={floor} maxLevel={maxLevel} />
        <PvpokeCard idx={ds.data!} pvp={pvp} me={me} />
      </main>
    </>
  );
}

function IvSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-sm font-medium text-ink-2">{label}</span>
      <input type="range" min={0} max={15} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 flex-1 accent-[var(--go)]" />
      <span className={`tnum w-7 shrink-0 text-right text-lg font-bold ${value === 15 ? 'text-go-ink dark:text-go' : ''}`}>{value}</span>
    </label>
  );
}

/** Results for one form of the evolution line at a time: the last one first, as that is what gets played. */
function Results(props: { me: PvpPokemon; line: PvpPokemon[]; idx: DatasetIndex; pvp: PvpData; iv: Ivs; level: number | null; floor: number; maxLevel: number }) {
  const { me, line, idx, pvp, iv, level, maxLevel } = props;
  const t = useT();
  const { lang } = useLang();
  const [chosen, setChosen] = useState<string | null>(null);
  const p = line.find((x) => x.key === chosen) ?? line[line.length - 1] ?? me;
  const masterCp = cpOf(p, iv, cpmAt(pvp.cpm, maxLevel));
  return (
    <section className="mt-4">
      {line.length > 1 && (
        <div className="mb-2 flex gap-2 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label={t.pvp_evo_pick}>
          {line.map((x) => {
            const v = picture(idx, x);
            return (
              <Chip key={x.key} role="tab" aria-selected={x.key === p.key} active={x.key === p.key} onClick={() => setChosen(x.key)} className="pl-1.5">
                {v && <Sprite idx={idx} variant={v} size={26} />}
                {localized(x.name, lang)}
              </Chip>
            );
          })}
        </div>
      )}
      {/* Its name again only when it is not the Pokémon of the page. */}
      {line.length > 1 && (
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-lg font-bold">{localized(p.name, lang)}</h2>
          {p.key !== me.key && <span className="text-xs font-semibold text-ink-3">{t.pvp_after_evo}</span>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <LeagueCard league="great" {...props} p={p} />
        <LeagueCard league="ultra" {...props} p={p} />
      </div>
      <div className="card mt-3 px-3 py-2.5 text-sm">
        <div>
          <span className="font-semibold">{t.league_master}</span>
          <span className="text-ink-2"> · {t.pvp_master_hint(maxLevel, masterCp)}</span>
        </div>
        {level !== null && level < maxLevel && <Cost pvp={pvp} from={level} to={maxLevel} />}
      </div>
      {line.length > 1 && <p className="mt-2 text-xs text-ink-3">{t.pvp_evo_note}</p>}
    </section>
  );
}

type Verdict = 'perfect' | 'excellent' | 'great' | 'ok' | 'weak';
/** Out of 4096 combinations: rank 1, top 10, top 100 (~2.5 %), then how close its stats are to rank 1's. */
function verdictOf(r: RankInfo): Verdict {
  if (r.rank === 1) return 'perfect';
  if (r.rank <= 10) return 'excellent';
  if (r.rank <= 100) return 'great';
  if (r.percent >= 97) return 'ok';
  return 'weak';
}
const VERDICT_STYLE: Record<Verdict, string> = {
  perfect: 'bg-shiny-soft text-[#7a5a0e] dark:text-shiny',
  excellent: 'bg-go-soft text-go-ink',
  great: 'bg-go-soft text-go-ink',
  ok: 'bg-paper-2 text-ink-2',
  weak: 'bg-berry/10 text-berry',
};

function LeagueCard({ league, p, idx, pvp, iv, level, floor, maxLevel }: { league: 'great' | 'ultra'; p: PvpPokemon; idx: DatasetIndex; pvp: PvpData; iv: Ivs; level: number | null; floor: number; maxLevel: number }) {
  const t = useT();
  const { lang } = useLang();
  const cap = LEAGUES[league];
  const title = league === 'great' ? t.league_great : t.league_ultra;
  const effFloor = Math.min(floor, iv.atk, iv.def, iv.sta);
  const r = useMemo(() => rankOf(pvp, p, iv, cap, maxLevel, effFloor), [pvp, p, iv.atk, iv.def, iv.sta, cap, maxLevel, effFloor]);
  const head = (
    <div className="flex items-center gap-2">
      <LeagueIcon league={league} size={20} />
      <h3 className="flex-1 text-sm font-bold">{title}</h3>
    </div>
  );
  // Even the best IVs at max level stay under the cap: no ranking to speak of in this league.
  if (r.best.level === maxLevel && r.best.cp < cap) {
    return (
      <div className="card p-3">
        {head}
        <p className="mt-2 text-sm text-ink-2">{t.pvp_capped(r.cp)}</p>
      </div>
    );
  }
  const verdict = verdictOf(r);
  const fmt = (x: number) => x.toLocaleString(lang);
  const cpNow = level !== null ? cpOf(p, iv, cpmAt(pvp.cpm, level)) : null;
  const diff = (k: keyof Ivs) => iv[k] - r.best.ivs[k];
  return (
    <div className="card p-3" aria-label={title}>
      <div className="flex items-center gap-2">
        <LeagueIcon league={league} size={20} />
        <h3 className="flex-1 text-sm font-bold">{title}</h3>
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${VERDICT_STYLE[verdict]}`}>{t.pvp_verdict[verdict]}</span>
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-[34px] font-extrabold leading-none">#{fmt(r.rank)}</span>
        <span className="tnum text-xs text-ink-3">/ {fmt(r.of)}</span>
        <span className="tnum ml-auto text-sm font-semibold">{r.percent.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{'\u00a0'}%</span>
      </div>
      <div className="track mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-2" title={t.pvp_percent_hint}>
        {/* From 90 % (a poor pick) to 100 % (rank 1): the part where IVs make a difference. */}
        <div className="h-full rounded-full bg-go" style={{ width: `${Math.max(3, Math.min(100, (r.percent - 90) * 10))}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-3">{t.pvp_percent_hint}</p>

      <dl className="tnum mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-paper-2 px-2.5 py-1.5">
          <dt className="text-[11px] text-ink-3">{t.pvp_target_level}</dt>
          <dd className="font-bold">{fmt(r.level)}{r.level > pvp.maxLevel ? ' *' : ''}</dd>
        </div>
        <div className="rounded-lg bg-paper-2 px-2.5 py-1.5">
          <dt className="text-[11px] text-ink-3">{t.pvp_target_cp}</dt>
          <dd className="font-bold">{fmt(r.cp)} PC</dd>
        </div>
      </dl>
      {r.level === maxLevel && r.cp < cap * 0.93 && <p className="mt-1 text-xs text-ink-3">{t.pvp_under_cap}</p>}

      {/* What it takes from where it is now. */}
      <div className="mt-3">
        {level === null ? (
          <p className="text-xs text-ink-3">{t.pvp_cost_needs_level}</p>
        ) : cpNow !== null && cpNow > cap ? (
          <p className="text-sm font-semibold text-berry">{t.pvp_too_high(cpNow)}</p>
        ) : level >= r.level ? (
          <p className="text-sm font-semibold text-go-ink dark:text-go">{t.pvp_ready}</p>
        ) : (
          <div className="text-sm">
            <span className="text-ink-2">{t.pvp_from(level)}</span>
            <Cost pvp={pvp} from={level} to={r.level} />
          </div>
        )}
      </div>

      {/* Against rank 1 of this league. */}
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="tnum text-xs text-ink-2">
          <span className="font-semibold text-ink">{t.pvp_rank1}</span> {r.best.ivs.atk}/{r.best.ivs.def}/{r.best.ivs.sta} · {t.pvp_level} {fmt(r.best.level)} · PC {r.best.cp}
        </p>
        {r.rank > 1 && (
          <p className="tnum mt-1 flex flex-wrap gap-x-3 text-xs">
            {(['atk', 'def', 'sta'] as const).map((k) => (
              <span key={k} className={diff(k) === 0 ? 'text-ink-3' : 'text-ink-2'}>
                {t[k === 'atk' ? 'stat_atk' : k === 'def' ? 'stat_def' : 'stat_sta']} {diff(k) > 0 ? `+${diff(k)}` : diff(k)}
              </span>
            ))}
          </p>
        )}
      </div>

      {r.rank > 10 && <BetterSearch league={league} p={p} idx={idx} pvp={pvp} maxLevel={maxLevel} />}
    </div>
  );
}

/** A search to paste in the game to find a better one in storage. */
function BetterSearch({ league, p, idx, pvp, maxLevel }: { league: 'great' | 'ultra'; p: PvpPokemon; idx: DatasetIndex; pvp: PvpData; maxLevel: number }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const [wide, setWide] = useState(false);
  const gameLang = savedGameLang(lang);
  // The whole family: a better Marill is as good as a better Azumarill.
  let root = idx.speciesByDex.get(p.dex);
  for (let i = 0; root?.parent && i < 3; i++) root = idx.speciesByDex.get(root.parent) ?? root;
  const family = root ? (gameLang === 'fr' ? root.name.fr ?? root.name.en : root.name.en) : undefined;
  const s = useMemo(() => ivSearch(rankTable(pvp, p, LEAGUES[league], maxLevel), { top: wide ? 41 : 10, family, lang: gameLang }), [pvp, p, league, maxLevel, wide, family, gameLang]);
  if (!s.text) return null;
  return (
    <div className="mt-3 rounded-xl bg-paper-2 p-2.5">
      <div className="flex items-baseline gap-2">
        <p className="flex-1 text-xs font-semibold text-ink-2">{t.pvp_find_better}</p>
        <button type="button" className="text-xs font-semibold text-sky" onClick={() => setWide((w) => !w)}>{wide ? t.pvp_search_strict : t.pvp_search_wide}</button>
      </div>
      <code className="mt-1 block break-all text-[13px]">{s.text}</code>
      <div className="mt-1.5 flex items-center gap-2">
        <p className="tnum flex-1 text-[11px] text-ink-3">{t.pvp_search_scope(s.top, s.matched)}</p>
        <Button className="min-h-8 px-3 text-xs" onClick={async () => { if (await copyText(s.text)) toast(t.copied); }}>{t.copy}</Button>
      </div>
    </div>
  );
}

function Cost({ pvp, from, to }: { pvp: PvpData; from: number; to: number }) {
  const t = useT();
  const { lang } = useLang();
  const c = powerUpCost(pvp, from, to);
  const n = (x: number) => x.toLocaleString(lang);
  const buddyOnly = to > pvp.maxLevel;
  return (
    <span className="mt-1 block">
      <span className="tnum flex flex-wrap gap-1.5">
        <span className="rounded-md bg-sky/10 px-1.5 py-0.5 text-xs font-semibold text-sky">{n(c.stardust)} {t.stardust}</span>
        {c.candy > 0 && <span className="rounded-md bg-go-soft px-1.5 py-0.5 text-xs font-semibold text-go-ink">{n(c.candy)} {t.candy}</span>}
        {c.xlCandy > 0 && <span className="rounded-md bg-shiny-soft px-1.5 py-0.5 text-xs font-semibold text-[#7a5a0e] dark:text-shiny">{n(c.xlCandy)} {t.xl_candy}</span>}
      </span>
      {buddyOnly && <span className="mt-1 block text-xs text-ink-3">* {t.pvp_buddy_needed}</span>}
    </span>
  );
}

/** Save the Pokémon as entered to "My Pokémon", or update / remove the saved one this page was opened from. */
function SaveMine({ me, iv, level, mineId, onSaved, onRemoved }: { me: PvpPokemon; iv: Ivs; level: number | null; mineId: string | null; onSaved: (id: string) => void; onRemoved: () => void }) {
  const t = useT();
  const toast = useToast();
  const user = useMe();
  const mine = useMyPvp();
  const save = useSaveMyPvp();
  const del = useDeleteMyPvp();
  if (!user.data) return null;
  const saved = mineId ? mine.data?.find((p) => p.id === mineId) : undefined;
  const same = saved && saved.atk === iv.atk && saved.def === iv.def && saved.sta === iv.sta && saved.level === level;
  return (
    <div className="mt-3 flex gap-2">
      <Button
        tone={saved ? 'quiet' : 'primary'}
        className="flex-1"
        disabled={save.isPending || !!same}
        onClick={async () => {
          const r = await save.mutateAsync({ id: saved?.id, formKey: me.key, atk: iv.atk, def: iv.def, sta: iv.sta, level });
          toast(saved ? t.pvp_mine_updated : t.pvp_mine_saved);
          if (!saved) onSaved(r.pokemon.id);
        }}
      >
        {saved ? (same ? t.pvp_mine_is_saved : t.pvp_mine_update) : t.pvp_mine_save}
      </Button>
      {saved && (
        <Button tone="danger" disabled={del.isPending} onClick={async () => { await del.mutateAsync(saved.id); toast(t.pvp_mine_removed); onRemoved(); }}>
          {t.pvp_mine_remove}
        </Button>
      )}
    </div>
  );
}

/** Best league rank of a saved Pokémon over its evolution line: what it is worth once evolved. */
function bestUse(pvp: PvpData, byKey: Map<string, PvpPokemon>, m: MyPvpPokemon) {
  const start = byKey.get(m.formKey);
  if (!start) return null;
  const iv = { atk: m.atk, def: m.def, sta: m.sta };
  let best: { form: PvpPokemon; league: 'great' | 'ultra'; r: RankInfo } | null = null;
  for (const form of evolutionLine(start, byKey))
    for (const league of ['great', 'ultra'] as const) {
      const r = rankOf(pvp, form, iv, LEAGUES[league], pvp.maxLevel);
      // A league it cannot reach the cap of does not count.
      if (r.best.level === pvp.maxLevel && r.best.cp < LEAGUES[league]) continue;
      if (!best || r.rank < best.r.rank) best = { form, league, r };
    }
  return best && { start, ...best };
}

function MyPokemon({ idx, pvp, byKey }: { idx: DatasetIndex; pvp: PvpData; byKey: Map<string, PvpPokemon> }) {
  const t = useT();
  const { lang } = useLang();
  const q = useMyPvp();
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () => (q.data ?? []).flatMap((m) => { const b = bestUse(pvp, byKey, m); return b ? [{ m, ...b }] : []; }).sort((a, b) => a.r.rank - b.r.rank),
    [q.data, pvp, byKey],
  );
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-base font-bold">{t.pvp_mine_title} <span className="tnum font-normal text-ink-3">{rows.length}</span></h2>
      <ul className="space-y-2">
        {shown.map(({ m, start, form, league, r }) => {
          const v = picture(idx, start);
          const qs = new URLSearchParams({ a: String(m.atk), d: String(m.def), s: String(m.sta), m: m.id, ...(m.level ? { l: String(m.level) } : {}) });
          return (
            <li key={m.id}>
              <Link to={`/pvp/${encodeURIComponent(start.key)}?${qs}`} className="card flex items-center gap-3 p-2 hover:brightness-[0.98]">
                {v && <Sprite idx={idx} variant={v} size={48} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{localized(start.name, lang)}</div>
                  <div className="tnum text-xs text-ink-3">
                    {m.atk}/{m.def}/{m.sta}{m.level ? ` · ${t.pvp_level} ${m.level.toLocaleString(lang)}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tnum flex items-center justify-end gap-1 text-lg font-extrabold leading-none">
                    <LeagueIcon league={league} size={16} />#{r.rank.toLocaleString(lang)}
                  </div>
                  {form.key !== start.key && <div className="mt-0.5 text-[11px] text-ink-3">{t.pvp_mine_as(localized(form.name, lang))}</div>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length > 6 && (
        <button type="button" className="mt-2 text-sm font-semibold text-sky" onClick={() => setAll((x) => !x)}>{all ? t.pvp_mine_less : t.pvp_mine_all(rows.length)}</button>
      )}
    </section>
  );
}
