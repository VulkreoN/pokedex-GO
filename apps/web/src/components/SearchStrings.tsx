import { useMemo, useState } from 'react';
import type { GameLang, ListEntry } from '@mydexpogo/shared';
import type { DatasetIndex } from '../lib/dataset.js';
import { copyText } from '../lib/api.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { MAX_LENGTHS, TRADE_EXCLUSIONS, listSearch, saveExclusions, saveGameLang, saveMaxLength, savePreEvolutions, savedExclusions, savedGameLang, savedMaxLength, savedPreEvolutions } from '../lib/searchString.js';
import { useToast } from './toast.js';
import { Button, Chip } from './ui.js';

export function SearchStrings({ idx, entries }: { idx: DatasetIndex; entries: ListEntry[] }) {
  const t = useT();
  const toast = useToast();
  const { lang } = useLang();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [gameLang, setGameLangState] = useState<GameLang>(() => savedGameLang(lang));
  // For luckies by trade: what cannot or need not be traded is left out of the whole search.
  const [exclude, setExcludeState] = useState<string[]>(savedExclusions);
  const toggleExclude = (d: string) =>
    setExcludeState((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : TRADE_EXCLUSIONS.filter((x) => x === d || prev.includes(x));
      saveExclusions(next);
      return next;
    });
  const setGameLang = (l: GameLang) => {
    setGameLangState(l);
    saveGameLang(l);
  };
  const [preEvo, setPreEvoState] = useState(savedPreEvolutions);
  const setPreEvo = (on: boolean) => {
    setPreEvoState(on);
    savePreEvolutions(on);
  };
  const [maxLength, setMaxLengthState] = useState(savedMaxLength);
  const setMaxLength = (n: number) => {
    setMaxLengthState(n);
    saveMaxLength(n);
  };
  const { strings, dropped } = useMemo(() => listSearch(idx, entries, { onlyMissing, gameLang, exclude, preEvolutions: preEvo, maxLength }), [entries, idx, onlyMissing, gameLang, exclude, preEvo, maxLength]);

  const names: Record<string, string> = {
    shiny: t.shiny, costume: t.filter_costumes, female: '♀', male: '♂', gigantamax: 'Gigamax', lucky: t.tag_lucky, background: t.tag_background,
    shadow: t.tag_shadow, purified: t.tag_purified, dynamax: t.tag_dynamax, xxl: t.tag_xxl, xxs: t.tag_xxs, alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea',
  };
  const name = (m: string) => (m.startsWith('!') ? t.without(names[m.slice(1)] ?? m.slice(1)) : (names[m] ?? m));

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t.game_strings_help}</p>
      <div>
        <p className="mb-1 text-xs font-medium text-ink-3">{t.game_lang}</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={gameLang === 'fr'} onClick={() => setGameLang('fr')}>Français</Chip>
          <Chip active={gameLang === 'en'} onClick={() => setGameLang('en')}>English</Chip>
          <Chip active={onlyMissing} onClick={() => setOnlyMissing((v) => !v)} className="ml-auto">{t.only_missing}</Chip>
        </div>
      </div>
      <div>
        <Chip active={preEvo} onClick={() => setPreEvo(!preEvo)}>{t.with_pre_evolutions}</Chip>
        <p className="mt-1 text-xs text-ink-3">{t.with_pre_evolutions_hint}</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-ink-3">{t.max_length_title}</p>
        <div className="flex flex-wrap gap-1.5">
          {MAX_LENGTHS.map((n) => (
            <Chip key={n} active={maxLength === n} onClick={() => setMaxLength(n)} className="min-h-8 px-2.5 text-xs">{n ? t.max_length(n) : t.max_length_none}</Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-3">{t.max_length_hint}</p>
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
      {dropped > 0 && <p className="text-xs text-ink-3">{t.exclude_dropped(dropped)} {t.exclude_fixed}</p>}
      {strings.length === 0 && <p className="py-6 text-center text-sm text-ink-3">{t.nothing_here}</p>}
      <ul className="space-y-2">
        {strings.map((s) => (
          <li key={s.text} className="rounded-card border border-line bg-paper p-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                {t.strings_count(s.count)}
                {s.batches > 1 && <span className="text-ink-3"> · {s.batch}/{s.batches}</span>}
              </span>
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
