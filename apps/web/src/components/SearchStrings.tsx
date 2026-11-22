import { useMemo, useState } from 'react';
import { buildSearchStrings, speciesSearchInfo, targetFromVariant, type GameLang, type ListEntry } from '@mydexpogo/shared';
import type { DatasetIndex } from '../lib/dataset.js';
import { copyText } from '../lib/api.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useToast } from './toast.js';
import { Button, Chip } from './ui.js';

/** Left out of the whole search when looking for trades to get luckies (costumes aside). */
const TRADE_EXCLUSIONS = ['traded', '4*', 'shiny', 'costume', 'shadow', 'purified', 'lucky'];

export function SearchStrings({ idx, entries }: { idx: DatasetIndex; entries: ListEntry[] }) {
  const t = useT();
  const toast = useToast();
  const { lang } = useLang();
  const [onlyMissing, setOnlyMissing] = useState(true);
  // The search bar only understands the game's own language: remembered per device, defaults to the app's.
  const [gameLang, setGameLangState] = useState<GameLang>(() => {
    try {
      const saved = localStorage.getItem('gameLang');
      if (saved === 'fr' || saved === 'en') return saved;
    } catch {}
    return lang === 'fr' ? 'fr' : 'en';
  });
  // For luckies by trade: what cannot or need not be traded is left out of the whole search. Remembered per device.
  const [exclude, setExcludeState] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('searchExclude') ?? 'null') as string[] | null;
      if (Array.isArray(saved)) return saved;
    } catch {}
    return [...TRADE_EXCLUSIONS];
  });
  const toggleExclude = (d: string) =>
    setExcludeState((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : TRADE_EXCLUSIONS.filter((x) => x === d || prev.includes(x));
      try {
        localStorage.setItem('searchExclude', JSON.stringify(next));
      } catch {}
      return next;
    });
  const setGameLang = (l: GameLang) => {
    setGameLangState(l);
    try {
      localStorage.setItem('gameLang', l);
    } catch {}
  };
  // What each species can be (regional forms, costumes, genders): a plain entry leaves the others out
  // (plain Growlithe, not Hisuian), and numbers that cannot break a clause are not listed in it.
  const species = useMemo(() => speciesSearchInfo(idx.ds.variants), [idx]);
  const strings = useMemo(() => {
    const targets = entries
      .filter((e) => !onlyMissing || !e.done)
      .flatMap((e) => {
        const v = idx.variantByKey.get(e.variantKey);
        return v ? [targetFromVariant(v, e.shiny, e.gender, e.tag, species.get(v.dex)?.regions ?? [])] : [];
      });
    return buildSearchStrings(targets, { lang: gameLang, species, exclude });
  }, [entries, idx, onlyMissing, gameLang, species, exclude]);

  const names: Record<string, string> = {
    shiny: t.shiny, costume: t.filter_costumes, female: '♀', male: '♂', gigantamax: 'Gigamax', lucky: t.tag_lucky, background: t.tag_background,
    shadow: t.tag_shadow, purified: t.tag_purified, dynamax: t.tag_dynamax, xxl: t.tag_xxl, xxs: t.tag_xxs, alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea',
  };
  const name = (m: string) => (m.startsWith('!') ? t.without(names[m.slice(1)] ?? m.slice(1)) : (names[m] ?? m));
  const label = (mods: string[]) => (mods.filter((m) => !m.startsWith('!')).length ? mods.map(name).join(' ') : [t.filter_all, ...mods.map(name)].join(' '));

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t.game_strings_help}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={onlyMissing} onClick={() => setOnlyMissing((v) => !v)}>
          {t.only_missing}
        </Chip>
        <span className="ml-auto text-xs font-medium text-ink-3">{t.game_lang}</span>
        <Chip active={gameLang === 'fr'} onClick={() => setGameLang('fr')}>Français</Chip>
        <Chip active={gameLang === 'en'} onClick={() => setGameLang('en')}>English</Chip>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-ink-3">{t.exclude_title}</p>
        <div className="flex flex-wrap gap-1.5">
          {TRADE_EXCLUSIONS.map((d) => (
            <Chip key={d} active={exclude.includes(d)} onClick={() => toggleExclude(d)} className="min-h-8 px-2.5 text-xs">
              {t[`exclude_${d === '4*' ? 'hundo' : d}` as 'exclude_traded']}
            </Chip>
          ))}
        </div>
      </div>
      {strings.length === 0 && <p className="py-6 text-center text-sm text-ink-3">{t.nothing_here}</p>}
      <ul className="space-y-2">
        {strings.map((s) => (
          <li key={s.text} className="rounded-card border border-line bg-paper p-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                {s.parts ? s.parts.map((p) => `${label(p.modifiers)} (${p.count})`).join(' · ') : label(s.modifiers)}
                {s.batches > 1 && <span className="text-ink-3"> {s.batch}/{s.batches}</span>}
              </span>
              <span className="tnum text-ink-3">{s.count}</span>
            </div>
            <code className="block break-all rounded-lg bg-paper-2 p-2 text-[13px] leading-snug">{s.text}</code>
            {s.skippedExclusions && <p className="mt-1 text-xs text-ink-2">{t.exclude_skipped(s.skippedExclusions.map((d) => t[`exclude_${d === '4*' ? 'hundo' : d}` as 'exclude_traded']).join(', '))}</p>}
            {s.unsupported && <p className="mt-1 text-xs text-ink-2">{t.game_lang_missing(s.unsupported.map(name).join(', '))}</p>}
            {s.looser && (
              <p className="mt-1 text-xs text-ink-2">
                {t.search_also(
                  s.looser
                    .flatMap((x) => x.dex.map((d) => t.search_also_item(localized(idx.speciesByDex.get(d)?.name, lang) || `#${d}`, x.dim, names[x.dim] ?? x.dim)))
                    .join(', '),
                )}
              </p>
            )}
            <Button
              tone="primary"
              className="mt-2 w-full"
              onClick={async () => {
                if (await copyText(s.text)) toast(t.copied);
              }}
            >
              {t.copy}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
