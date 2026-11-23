import { useState } from 'react';
import { Link } from 'react-router';
import type { PvpData, PvpPokemon } from '@mydexpogo/shared';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { LEAGUE_LIST, ROLES, formOf, leagueName, moveName, pvpokeUrl, usePvpDetails, type FormRef, type League, type RankedDetail } from '../lib/pvpoke.js';
import { LeagueIcon } from './PvpTops.js';
import { Sprite } from './Sprite.js';
import { TypeBadge } from './TypeBadge.js';
import { Chip } from './ui.js';

/** What PvPoke says about this form: rank, recommended moves, role scores, best wins and worst losses. */
export function PvpokeCard({ idx, pvp, me }: { idx: DatasetIndex; pvp: PvpData; me: PvpPokemon }) {
  const t = useT();
  const { lang } = useLang();
  const q = usePvpDetails(me.dex);
  const mine = (q.data ?? []).filter((r) => formOf(pvp, r)?.key === me.key);
  // Start on the league (and normal / Shadow) where it ranks best.
  const best = [...mine].sort((a, b) => a.rank / a.of - b.rank / b.of)[0];
  const [league, setLeague] = useState<League | null>(null);
  const [shadow, setShadow] = useState<boolean | null>(null);
  if (q.isPending || q.isError) return null;

  const leagues = LEAGUE_LIST.filter((l) => mine.some((r) => r.league === l));
  const l = league && leagues.includes(league) ? league : (best?.league ?? 'great');
  const inLeague = mine.filter((r) => r.league === l);
  const sh = shadow !== null && inLeague.some((r) => r.shadow === shadow) ? shadow : (inLeague.find((r) => r === best)?.shadow ?? inLeague[0]?.shadow ?? false);
  const r = inLeague.find((x) => x.shadow === sh);

  return (
    <section className="card mt-4 p-3" aria-label={t.pvpoke_title}>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="flex-1 text-base font-bold">{t.pvpoke_title}</h2>
        {r && <a href={pvpokeUrl(r)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky">{t.pvpoke_open}</a>}
      </div>
      {!r ? (
        <p className="text-sm text-ink-2">{t.pvpoke_unranked}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {leagues.map((x) => (
              <Chip key={x} active={x === l} onClick={() => setLeague(x)}>
                <LeagueIcon league={x} size={16} />
                {leagueName(t, x)}
              </Chip>
            ))}
            {inLeague.length > 1 &&
              [false, true].map((s) => (
                <Chip key={String(s)} active={s === sh} onClick={() => setShadow(s)}>{s ? t.tag_shadow : t.normal}</Chip>
              ))}
          </div>

          <div className="mt-3 flex items-end gap-3">
            <div>
              <div className="tnum text-[34px] font-extrabold leading-none">#{r.rank}</div>
              <div className="tnum mt-1 text-xs text-ink-3">{t.pvpoke_of(r.of)}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="tnum text-xl font-bold leading-none text-go-ink dark:text-go">{r.score.toLocaleString(lang, { maximumFractionDigits: 1 })}</div>
              <div className="mt-1 text-xs text-ink-3">{t.pvpoke_score}</div>
            </div>
          </div>

          {r.moveset.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-sm font-semibold text-ink-2">{t.pvpoke_moveset}</h3>
              <ul className="space-y-1.5">
                {r.moveset.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl bg-paper-2 px-2.5 py-2">
                    <TypeBadge type={m.type} small />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{moveName(pvp, m, lang)}</span>
                    <span className="tnum shrink-0 text-xs text-ink-3">{i === 0 ? t.move_fast : t.move_energy(m.energy)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <h3 className="mb-1.5 text-sm font-semibold text-ink-2">{t.pvpoke_roles}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {ROLES.filter((role) => r.scores[role] !== undefined).map((role) => (
                <div key={role}>
                  <div className="flex items-baseline justify-between text-xs">
                    <dt className="text-ink-2">{t.pvpoke_role[role]}</dt>
                    <dd className="tnum font-semibold">{Math.round(r.scores[role]!)}</dd>
                  </div>
                  <div className="track mt-0.5 h-1.5 overflow-hidden rounded-full bg-paper-2">
                    <div className="h-full rounded-full bg-go" style={{ width: `${Math.min(100, r.scores[role]!)}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <Matchups title={t.pvpoke_wins} list={r.wins} idx={idx} pvp={pvp} />
          <Matchups title={t.pvpoke_losses} list={r.losses} idx={idx} pvp={pvp} />
        </>
      )}
    </section>
  );
}

function Matchups({ title, list, idx, pvp }: { title: string; list: RankedDetail['wins']; idx: DatasetIndex; pvp: PvpData }) {
  const t = useT();
  const { lang } = useLang();
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-1.5 text-sm font-semibold text-ink-2">{title}</h3>
      <ul className="grid grid-cols-5 gap-1">
        {list.map((o: FormRef) => {
          const p = formOf(pvp, o);
          const v = p && (idx.variantByKey.get(p.key) ?? idx.coverOf.get(p.dex));
          const name = p ? localized(p.name, lang).replace(/ \(.*\)$/, '') : o.name;
          const body = (
            <span className="flex flex-col items-center text-center">
              {v && <Sprite idx={idx} variant={v} size={44} />}
              <span className="w-full truncate text-[11px] font-semibold leading-tight">{name}</span>
              {o.shadow && <span className="text-[10px] font-semibold leading-tight text-berry">{t.tag_shadow}</span>}
            </span>
          );
          return <li key={o.speciesId}>{p ? <Link to={`/pvp/${encodeURIComponent(p.key)}`} className="block rounded-lg py-1 hover:bg-paper-2">{body}</Link> : body}</li>;
        })}
      </ul>
    </div>
  );
}
