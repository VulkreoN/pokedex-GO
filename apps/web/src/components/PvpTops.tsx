import { Link } from 'react-router';
import { LEAGUES, type PvpPokemon, type PvpTop } from '@mydexpogo/shared';
import { useLang, useT } from '../lib/i18n.js';

/** League icons from the game files (PokeMiners), like the sprites. */
const ICON = 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Combat/';
export const LEAGUE_ICONS = { great: `${ICON}pogo_great_league.png`, ultra: `${ICON}pogo_ultra_league.png` } as const;

export function LeagueIcon({ league, size = 14 }: { league: 'great' | 'ultra'; size?: number }) {
  const t = useT();
  return <img src={LEAGUE_ICONS[league]} alt={league === 'great' ? t.league_great : t.league_ultra} width={size} height={size} className="shrink-0" loading="lazy" />;
}

/**
 * Rank 1 IVs per league (level 50, no best buddy). Greyed when even the best IVs at max level stay well under the
 * cap: the league does not really suit it.
 */
export function PvpTops({ p, link = false }: { p: PvpPokemon | undefined; link?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  if (!p?.top) return null;
  const row = (league: 'great' | 'ultra', top: PvpTop) => {
    const [a, d, s, level, cp] = top;
    const under = level >= 50 && cp < LEAGUES[league] * 0.9;
    const name = league === 'great' ? t.league_great : t.league_ultra;
    const title = `${name} · ${t.pvp_rank1} ${a}/${d}/${s} · ${t.pvp_level} ${level.toLocaleString(lang)} · PC ${cp}`;
    return (
      <span key={league} title={title} aria-label={title} className={`flex items-center justify-center gap-1 ${under ? 'opacity-45' : ''}`}>
        <LeagueIcon league={league} />
        <span className="tnum text-[11px] font-bold leading-none">{a}/{d}/{s}</span>
      </span>
    );
  };
  const body = (
    <span className="mt-1 flex w-full flex-col gap-0.5">
      {row('great', p.top.great)}
      {row('ultra', p.top.ultra)}
    </span>
  );
  return link ? (
    <Link to={`/pvp/${encodeURIComponent(p.key)}?a=${p.top.great[0]}&d=${p.top.great[1]}&s=${p.top.great[2]}`} className="block w-full rounded-md hover:bg-paper-2">
      {body}
    </Link>
  ) : (
    body
  );
}
