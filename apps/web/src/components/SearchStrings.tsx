import { useMemo, useState } from 'react';
import type { GameLang, ListEntry } from '@mydexpogo/shared';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { MAX_LENGTHS, TRADE_EXCLUSIONS, listSearch, saveExclusions, saveGameLang, saveMaxLength, savePreEvolutions, savedExclusions, savedGameLang, savedMaxLength, savedPreEvolutions } from '../lib/searchString.js';
import { Chip, CopyButton } from './ui.js';

export function SearchStrings({ idx, entries }: { idx: DatasetIndex; entries: ListEntry[] }) {
  const t = useT();
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

  /** Two or more choices side by side, one on. */
  const segmented = <T extends string | number>(value: T, options: { v: T; label: string }[], set: (v: T) => void) => (
    <div className="inline-flex shrink-0 rounded-full bg-paper-2 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => set(o.v)}
          className={`min-h-8 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition ${value === o.v ? 'bg-ink text-paper shadow-sm' : 'text-ink-3 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  /** An on / off setting on one line, its explanation under the label. */
  const toggle = (label: string, on: boolean, set: (v: boolean) => void, hint?: string) => (
    <button type="button" aria-pressed={on} aria-label={label} onClick={() => set(!on)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? 'bg-go' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{t.game_strings_help}</p>

      {strings.length === 0 && <p className="py-6 text-center text-sm text-ink-3">{t.nothing_here}</p>}
      <ul className="space-y-2">
        {strings.map((s) => (
          <li key={s.text} className="rounded-card border border-line bg-paper p-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                {t.strings_count(s.count)}
                {s.batches > 1 && <span className="text-ink-3"> · {s.batch}/{s.batches}</span>}
              </span>
              <span className="tnum text-xs text-ink-3">{t.chars(s.text.length)}</span>
            </div>
            <code className="block max-h-40 overflow-y-auto break-all rounded-lg bg-paper-2 p-2 text-[13px] leading-snug">{s.text}</code>
            {s.skippedExclusions && <p className="mt-1 text-xs text-ink-2">{t.exclude_skipped(s.skippedExclusions.map((d) => t[`exclude_${d === '4*' ? 'hundo' : d}` as 'exclude_traded']).join(', '))}</p>}
            {s.unsupported && <p className="mt-1 text-xs text-ink-2">{t.game_lang_missing(s.unsupported.map(name).join(', '))}</p>}
            {s.looser && <LooserNote items={s.looser.flatMap((x) => x.dex.map((d) => t.search_also_item(localized(idx.speciesByDex.get(d)?.name, lang) || `#${d}`, x.dim, names[x.dim] ?? x.dim)))} />}
            <CopyButton tone="primary" className="mt-2 w-full" text={s.text} />
          </li>
        ))}
      </ul>
      {dropped > 0 && <p className="text-xs text-ink-3">{t.exclude_dropped(dropped)} {t.exclude_fixed}</p>}

      <section aria-label={t.search_settings} className="overflow-hidden rounded-card border border-line">
        <h3 className="bg-paper-2 px-3 py-2 text-sm font-bold text-ink-2">{t.search_settings}</h3>
        <div className="divide-y divide-line">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-sm font-semibold">{t.game_lang}</span>
            {segmented<GameLang>(gameLang, [{ v: 'fr', label: 'Français' }, { v: 'en', label: 'English' }], setGameLang)}
          </div>
          {toggle(t.only_missing, onlyMissing, setOnlyMissing)}
          {toggle(t.with_pre_evolutions, preEvo, setPreEvo, t.with_pre_evolutions_hint)}
          <div className="px-3 py-2.5">
            <p className="mb-2 text-sm font-semibold">{t.exclude_title}</p>
            <div className="flex flex-wrap gap-1.5">
              {TRADE_EXCLUSIONS.map((d) => (
                <Chip key={d} active={exclude.includes(d)} onClick={() => toggleExclude(d)} className="min-h-8 px-2.5 text-xs">
                  {t[`exclude_${d === '4*' ? 'hundo' : d}` as 'exclude_traded']}
                </Chip>
              ))}
            </div>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-sm font-semibold">{t.max_length_title}</p>
            <p className="mb-2 text-xs text-ink-3">{t.max_length_hint}</p>
            {segmented<number>(maxLength, MAX_LENGTHS.map((n) => ({ v: n, label: n ? t.max_length(n) : t.max_length_none })), setMaxLength)}
          </div>
        </div>
      </section>
    </div>
  );
}

/** What the search shows beyond the collection: the first few, the rest on demand. */
function LooserNote({ items }: { items: string[] }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <p className="mt-1 text-xs text-ink-2">
      {t.search_also(shown.join(', ') + (items.length > shown.length ? '…' : ''))}
      {items.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="ml-1 font-semibold text-sky">{all ? t.show_less : t.show_more(items.length - 4)}</button>
      )}
    </p>
  );
}
