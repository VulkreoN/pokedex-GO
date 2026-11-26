import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { bestUnderCap, buildFighter, defaultIvs, shieldMatrix, simulate, type BattleResult, type Fighter, type PvpData, type PvpPokemon, type PvpokeMove, type PvpokeSpecies } from '@mydexpogo/shared';
import { LeagueIcon } from '../components/PvpTops.js';
import { Sprite } from '../components/Sprite.js';
import { TypeBadge } from '../components/TypeBadge.js';
import { Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { LEAGUE_CP, LEAGUE_LIST, leagueName, moveName, speciesFor, useBattleData, type BattleData, type League } from '../lib/pvpoke.js';
import { picture, usePvp } from './PvpPage.js';
import { PickSheet } from './PvpTeamPage.js';

type SideKey = 'a' | 'b';

/** The URL holds everything (league, both Pokémon, Shadow, moves, IVs and level, shields, bait), so a battle can be shared. */
function useSideParams(side: SideKey) {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(`${side}${k}`);
  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) (v === null ? n.delete(`${side}${k}`) : n.set(`${side}${k}`, v));
      return n;
    }, { replace: true });
  return { get, set };
}

interface Built { fighter: Fighter; species: PvpokeSpecies; form: PvpPokemon }

/** One side as set in the URL, with PvPoke's recommended moveset and default IVs for the league where not chosen. */
function useFighter(side: SideKey, league: League, pvp: PvpData | undefined, byKey: Map<string, PvpPokemon>) {
  const p = useSideParams(side);
  const form = byKey.get(p.get('') ?? '');
  const shadow = p.get('sh') === '1';
  const data = useBattleData(form?.dex);
  const built = useMemo((): (Built & { data: BattleData }) | null => {
    if (!form || !pvp || !data.data) return null;
    const species = speciesFor(data.data.species, form, shadow);
    if (!species) return null;
    const byId = new Map(data.data.species.map((s) => [s.speciesId, s]));
    const moves = new Map(data.data.moves.map((m) => [m.moveId, m]));
    const rec = data.data.recommended[species.speciesId]?.[league];
    const chosen = p.get('m')?.split(',').filter(Boolean);
    const set = chosen?.length ? chosen : (rec ?? [species.fastMoves[0]!, ...species.chargedMoves.slice(0, 2)]);
    const [fast, ...charged] = set;
    const [dl, da, dd, ds] = defaultIvs(species, LEAGUE_CP[league]);
    const iv = p.get('iv')?.split('-').map(Number);
    const ivs = iv?.length === 3 && iv.every((x) => x >= 0 && x <= 15) ? { atk: iv[0]!, def: iv[1]!, sta: iv[2]! } : null;
    // Own IVs without a level: as high as the league's CP cap allows.
    const capLevel = ivs ? bestUnderCap(pvp, { atk: species.baseStats.atk, def: species.baseStats.def, sta: species.baseStats.hp }, ivs, LEAGUE_CP[league] >= 10000 ? Infinity : LEAGUE_CP[league], pvp.maxLevel).level : dl;
    const level = Number(p.get('lv')) || capLevel;
    const fighter = buildFighter({
      species,
      byId,
      moves,
      cpm: pvp.cpm,
      iv: ivs ?? { atk: da, def: dd, sta: ds },
      level,
      fast: fast!,
      charged,
      shields: Number(p.get('s') ?? 1),
      bait: p.get('bait') !== '0',
    });
    return fighter ? { fighter, species, form, data: data.data } : null;
  }, [form, pvp, data.data, shadow, league, p.get('m'), p.get('iv'), p.get('lv'), p.get('s'), p.get('bait')]);
  return { built, loading: !!form && data.isPending, form, shadow, set: p.set, get: p.get };
}

export function PvpBattlePage() {
  const t = useT();
  const { lang } = useLang();
  const { ds, pvp, byKey } = usePvp();
  const [params, setParams] = useSearchParams();
  const league: League = LEAGUE_LIST.find((l) => l === params.get('l')) ?? 'great';
  const a = useFighter('a', league, pvp, byKey);
  const b = useFighter('b', league, pvp, byKey);
  const [picking, setPicking] = useState<SideKey | null>(null);

  const result = useMemo(() => (a.built && b.built ? simulate(a.built.fighter, b.built.fighter) : null), [a.built, b.built]);
  const matrix = useMemo(() => (a.built && b.built ? shieldMatrix(a.built.fighter, b.built.fighter) : null), [a.built, b.built]);

  if (ds.isPending) return <Spinner />;
  if (!pvp || !ds.data) return <Empty>{t.pvp_unavailable}</Empty>;
  const idx = ds.data;
  const nameOf = (s: ReturnType<typeof useFighter>) => (s.form ? `${localized(s.form.name, lang)}${s.shadow ? ` ${t.tag_shadow.toLowerCase()}` : ''}` : '');
  const pvpokeLink = a.built && b.built ? `https://pvpoke.com/battle/${LEAGUE_CP[league]}/${a.built.species.speciesId}/${b.built.species.speciesId}/${a.built.fighter.shields}${b.built.fighter.shields}/` : null;

  return (
    <>
      <TopBar title={t.battle_title} back />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {LEAGUE_LIST.map((l) => (
            <Chip key={l} active={league === l} onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); n.set('l', l); return n; }, { replace: true })}>
              <LeagueIcon league={l} size={16} />
              {leagueName(t, l)}
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([a, b] as const).map((s, i) => (
            <FighterCard key={i} side={i === 0 ? 'a' : 'b'} s={s} idx={idx} pvp={pvp} name={nameOf(s)} onPick={() => setPicking(i === 0 ? 'a' : 'b')} />
          ))}
        </div>

        {(a.loading || b.loading) && <Spinner />}
        {!a.form || !b.form ? <p className="mt-6 text-center text-sm text-ink-2">{t.battle_intro}</p> : null}

        {result && a.built && b.built && (
          <>
            <ResultCard r={result} names={[nameOf(a), nameOf(b)]} pvp={pvp} fighters={[a.built.fighter, b.built.fighter]} />
            {matrix && <Matrix m={matrix} names={[nameOf(a), nameOf(b)]} />}
            <p className="mt-3 text-xs text-ink-3">
              {t.battle_disclaimer}{' '}
              {pvpokeLink && <a href={pvpokeLink} target="_blank" rel="noreferrer" className="font-semibold text-sky">{t.battle_check_pvpoke}</a>}
            </p>
          </>
        )}
      </main>
      <PickSheet
        open={picking !== null}
        league={league}
        onClose={() => setPicking(null)}
        onPick={(k) => { (picking === 'a' ? a : b).set({ '': k, m: null, iv: null, lv: null }); setPicking(null); }}
      />
    </>
  );
}

function FighterCard({ side, s, idx, pvp, name, onPick }: { side: SideKey; s: ReturnType<typeof useFighter>; idx: DatasetIndex; pvp: PvpData; name: string; onPick: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const v = s.form && picture(idx, s.form);
  const built = s.built;
  const species = built?.species;
  const moves = built ? new Map(built.data.moves.map((m) => [m.moveId, m])) : new Map<string, PvpokeMove>();
  const mv = (id: string) => (moves.get(id) ? moveName(pvp, { id, name: moves.get(id)!.name, type: moves.get(id)!.type, power: 0, energy: 0, energyGain: 0 }, lang) : id);
  const current = built ? [built.fighter.fast.id, ...built.fighter.charged.map((c) => c.id)] : [];
  const setMove = (slot: number, id: string) => {
    const next = [...current];
    next[slot] = id;
    s.set({ m: next.filter(Boolean).join(',') });
  };
  const hasShadow = !!(built && built.data.species.some((p) => p.dex === s.form?.dex && p.tags?.includes('shadow')));
  return (
    <section className="card p-2.5" aria-label={side === 'a' ? t.battle_you : t.battle_opponent}>
      <button type="button" onClick={onPick} className="flex w-full flex-col items-center rounded-lg pb-1 hover:bg-paper-2" aria-label={s.form ? `${t.team_change} ${name}` : t.battle_pick}>
        {v ? <Sprite idx={idx} variant={v} size={64} /> : <span className="flex h-16 items-center text-3xl text-ink-3">+</span>}
        <span className="w-full truncate text-center text-sm font-bold">{s.form ? name : t.battle_pick}</span>
        {s.form && <span className="mt-0.5 flex gap-0.5">{s.form.types.map((ty) => <TypeBadge key={ty} type={ty} small />)}</span>}
      </button>
      {built && species && (
        <div className="mt-2 space-y-1.5 text-xs">
          {hasShadow && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.shadow} onChange={(e) => s.set({ sh: e.target.checked ? '1' : null, m: null })} className="h-4 w-4 accent-go" />
              {t.tag_shadow}
            </label>
          )}
          <select aria-label={t.move_fast} value={current[0]} onChange={(e) => setMove(0, e.target.value)} className="w-full rounded-lg border border-line bg-card px-1.5 py-1 text-ink">
            {species.fastMoves.map((id) => <option key={id} value={id}>{mv(id)}</option>)}
          </select>
          {[1, 2].map((slot) => (
            <select key={slot} aria-label={`${t.battle_charged} ${slot}`} value={current[slot] ?? ''} onChange={(e) => setMove(slot, e.target.value)} className="w-full rounded-lg border border-line bg-card px-1.5 py-1 text-ink">
              {slot === 2 && <option value="">—</option>}
              {species.chargedMoves.map((id) => <option key={id} value={id}>{mv(id)} ({moves.get(id)?.energy})</option>)}
            </select>
          ))}
          <div className="flex items-center gap-1">
            <span className="text-ink-3">{t.battle_shields}</span>
            {[0, 1, 2].map((n) => (
              <button key={n} type="button" aria-pressed={built.fighter.shields === n} onClick={() => s.set({ s: String(n) })} className={`h-9 w-9 rounded-full border text-xs font-bold ${built.fighter.shields === n ? 'border-ink bg-ink text-card' : 'border-line'}`}>{n}</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={built.fighter.bait} onChange={(e) => s.set({ bait: e.target.checked ? null : '0' })} className="h-4 w-4 accent-go" />
            {t.battle_bait}
          </label>
          <p className="tnum text-ink-3">
            {t.battle_stats(Math.round(built.fighter.atk), Math.round(built.fighter.def), built.fighter.hp)}
          </p>
        </div>
      )}
    </section>
  );
}

function ResultCard({ r, names, pvp, fighters }: { r: BattleResult; names: [string, string]; pvp: PvpData; fighters: [Fighter, Fighter] }) {
  const t = useT();
  const { lang } = useLang();
  const verdict = r.winner === null ? t.battle_draw : t.battle_wins(names[r.winner]);
  const moveLabel = (side: 0 | 1, id: string) => {
    const m = fighters[side].charged.find((c) => c.id === id) ?? Object.values(fighters[side].forms ?? {}).flatMap((f) => f.charged).find((c) => c.id === id);
    return m ? moveName(pvp, { id, name: id, type: m.type, power: 0, energy: 0, energyGain: 0 }, lang) : id;
  };
  return (
    <section className="card mt-4 p-3" aria-label={t.battle_result}>
      <h2 className={`text-center text-lg font-extrabold ${r.winner === 0 ? 'text-go-ink dark:text-go' : r.winner === 1 ? 'text-berry' : ''}`}>{verdict}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {([0, 1] as const).map((i) => (
          <div key={i}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="truncate font-semibold">{names[i]}</span>
              <span className="tnum text-ink-3">{r.hp[i]}/{r.hpMax[i]} PV</span>
            </div>
            <div className="track mt-1 h-2 overflow-hidden rounded-full bg-paper-2">
              <div className={`h-full rounded-full ${r.hp[i] / r.hpMax[i] > 0.5 ? 'bg-go' : r.hp[i] / r.hpMax[i] > 0.2 ? 'bg-shiny' : 'bg-berry'}`} style={{ width: `${(100 * r.hp[i]) / r.hpMax[i]}%` }} />
            </div>
            <div className="tnum mt-1 text-xs text-ink-2">{t.battle_rating} <span className="font-bold">{r.rating[i]}</span></div>
          </div>
        ))}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink-2">{t.battle_timeline}</h3>
      <ol className="mt-1 space-y-1 text-sm">
        {r.events.map((e, k) => (
          <li key={k} className="flex gap-2">
            <span className="tnum w-10 shrink-0 text-right text-xs text-ink-3">{(e.turn / 2).toLocaleString(lang, { minimumFractionDigits: 1 })} s</span>
            {e.kind === 'charged' ? (
              <span className="min-w-0">
                <span className="font-semibold">{names[e.side]}</span> · {moveLabel(e.side, e.move)}
                {e.shielded ? <span className="text-ink-3"> — {t.battle_shielded}</span> : <span className="tnum text-ink-3"> — {e.damage} {t.battle_damage}</span>}
              </span>
            ) : (
              <span className="font-semibold text-berry">{t.battle_fainted(names[e.side])}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="tnum mt-2 text-xs text-ink-3">{t.battle_summary(r.turns / 2, r.fastHits[0], r.fastHits[1])}</p>
    </section>
  );
}

/** Battle ratings for every shield scenario, from the first fighter's side: green wins, red losses. */
function Matrix({ m, names }: { m: BattleResult[][]; names: [string, string] }) {
  const t = useT();
  return (
    <section className="card mt-3 p-3">
      <h2 className="text-sm font-bold">{t.battle_matrix}</h2>
      <p className="mt-0.5 text-xs text-ink-3">{t.battle_matrix_hint(names[0], names[1])}</p>
      <table className="tnum mt-2 w-full table-fixed text-center text-sm">
        <thead>
          <tr>
            <th className="w-16 text-left text-[11px] font-normal text-ink-3">{t.battle_shields}</th>
            {[0, 1, 2].map((sb) => <th key={sb} className="text-xs font-semibold text-ink-2">{sb}</th>)}
          </tr>
        </thead>
        <tbody>
          {m.map((row, sa) => (
            <tr key={sa}>
              <th className="text-left text-xs font-semibold text-ink-2">{sa}</th>
              {row.map((r, sb) => (
                <td key={sb} className="p-0.5">
                  <span className={`block rounded-md py-1.5 font-bold ${r.rating[0] > 500 ? 'bg-go-soft text-go-ink' : r.rating[0] < 500 ? 'bg-berry/15 text-berry' : 'bg-paper-2'}`}>{r.rating[0]}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
