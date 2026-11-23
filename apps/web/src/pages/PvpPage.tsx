import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LEAGUES, cpOf, cpmAt, levelSteps, levelsForCp, powerUpCost, rankOf, type Ivs, type PvpData, type PvpPokemon, type RankInfo, type Variant } from '@mydexpogo/shared';
import { Sprite } from '../components/Sprite.js';
import { LeagueIcon } from '../components/PvpTops.js';
import { PvpokeCard } from '../components/PvpokeCard.js';
import { PVPOKE_URL, formOf, pvpokeRanks, usePvpRankings, type League, type RankedPokemon } from '../lib/pvpoke.js';
import { TypeBadge } from '../components/TypeBadge.js';
import { Chip, Empty, Spinner, TopBar } from '../components/ui.js';
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

          <div className="mt-4 space-y-3">
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

          <div className="mt-4">
            <div className="mb-1 text-sm font-medium text-ink-2">{t.pvp_floor}</div>
            <div className="flex flex-wrap gap-2">
              {FLOORS.map((f) => (
                <Chip key={f} active={floor === f} onClick={() => set({ f: f ? String(f) : null })}>{t[`pvp_floor_${f}`]}</Chip>
              ))}
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={buddy} onChange={(e) => set({ b: e.target.checked ? '1' : null })} className="h-5 w-5 accent-[var(--go)]" />
            {t.pvp_buddy}
          </label>
        </section>

        {line.map((p) => (
          <FormResult key={p.key} p={p} idx={ds.data!} pvp={pvp} iv={iv} level={level} floor={floor} maxLevel={maxLevel} isStart={p.key === me.key} />
        ))}
        {line.length > 1 && <p className="mt-3 text-xs text-ink-3">{t.pvp_evo_note}</p>}
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

function FormResult(props: { p: PvpPokemon; idx: DatasetIndex; pvp: PvpData; iv: Ivs; level: number | null; floor: number; maxLevel: number; isStart: boolean }) {
  const { p, idx, pvp, iv, level, floor, maxLevel, isStart } = props;
  const t = useT();
  const { lang } = useLang();
  const v = picture(idx, p);
  const masterLevel = maxLevel;
  const masterCp = cpOf(p, iv, cpmAt(pvp.cpm, masterLevel));
  return (
    <section className="card mt-4 p-3">
      <div className="flex items-center gap-2">
        {v && <Sprite idx={idx} variant={v} size={44} />}
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{localized(p.name, lang)}</h2>
        {!isStart && <span className="shrink-0 text-xs font-semibold text-ink-3">{t.pvp_after_evo}</span>}
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <League title={t.league_great} cap={LEAGUES.great} {...props} />
        <League title={t.league_ultra} cap={LEAGUES.ultra} {...props} />
      </div>
      <div className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-sm">
        <span className="font-semibold">{t.league_master}</span>
        <span className="text-ink-2"> · {t.pvp_master_hint(masterLevel, masterCp)}</span>
        {level !== null && level < masterLevel && <Cost pvp={pvp} from={level} to={masterLevel} />}
      </div>
    </section>
  );
}

function rankTone(r: RankInfo): string {
  if (r.rank <= 10) return 'text-shiny';
  if (r.rank <= 100) return 'text-go-ink dark:text-go';
  if (r.percent >= 95) return 'text-ink';
  return 'text-ink-3';
}

function League({ title, cap, p, pvp, iv, level, floor, maxLevel }: { title: string; cap: number; p: PvpPokemon; pvp: PvpData; iv: Ivs; level: number | null; floor: number; maxLevel: number }) {
  const t = useT();
  const { lang } = useLang();
  const r = useMemo(() => rankOf(pvp, p, iv, cap, maxLevel, Math.min(floor, iv.atk, iv.def, iv.sta)), [pvp, p, iv.atk, iv.def, iv.sta, cap, maxLevel, floor]);
  const cpNow = level !== null ? cpOf(p, iv, cpmAt(pvp.cpm, level)) : null;
  // Even the best IVs at max level stay under the cap: no ranking to speak of in this league.
  if (r.best.level === maxLevel && r.best.cp < cap) {
    return (
      <div className="rounded-xl border border-dashed border-line p-3">
        <div className="text-sm font-bold">{title}</div>
        <p className="mt-1 text-sm text-ink-2">{t.pvp_capped(r.cp)}</p>
      </div>
    );
  }
  const tooLow = r.level === maxLevel && r.cp < cap * 0.93;
  let status: ReactNode = null;
  if (cpNow !== null && level !== null) {
    if (cpNow > cap) status = <p className="mt-2 text-sm font-semibold text-berry">{t.pvp_too_high(cpNow)}</p>;
    else if (level >= r.level) status = <p className="mt-2 text-sm font-semibold text-go-ink dark:text-go">{t.pvp_ready}</p>;
    else status = <div className="mt-2 text-sm"><span className="text-ink-2">{t.pvp_from(level)}</span><Cost pvp={pvp} from={level} to={r.level} /></div>;
  }
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`tnum text-3xl font-extrabold ${rankTone(r)}`}>#{r.rank}</span>
        <span className="tnum text-xs text-ink-3">/ {r.of}</span>
        <span className="tnum ml-auto text-sm font-semibold">{r.percent.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{'\u00a0'}%</span>
      </div>
      <div className="tnum mt-1 text-sm">
        {t.pvp_level} {r.level.toLocaleString(lang)} · PC {r.cp}
      </div>
      {tooLow && <p className="mt-1 text-xs text-ink-3">{t.pvp_under_cap}</p>}
      {status}
      <p className="tnum mt-2 text-xs text-ink-3">
        {t.pvp_rank1} {r.best.ivs.atk}/{r.best.ivs.def}/{r.best.ivs.sta} · {t.pvp_level} {r.best.level} · PC {r.best.cp}
      </p>
    </div>
  );
}

function Cost({ pvp, from, to }: { pvp: PvpData; from: number; to: number }) {
  const t = useT();
  const { lang } = useLang();
  const c = powerUpCost(pvp, from, to);
  const n = (x: number) => x.toLocaleString(lang);
  const parts = [`${n(c.stardust)} ${t.stardust}`, c.candy ? `${n(c.candy)} ${t.candy}` : null, c.xlCandy ? `${n(c.xlCandy)} ${t.xl_candy}` : null].filter(Boolean);
  const buddyOnly = to > pvp.maxLevel;
  return (
    <span className="tnum block text-sm font-semibold">
      {parts.join(' · ')}
      {buddyOnly && <span className="block text-xs font-normal text-ink-3">{t.pvp_buddy_needed}</span>}
    </span>
  );
}
