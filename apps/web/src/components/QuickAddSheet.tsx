import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ENTRY_TAGS, neutralKey, type EntryTag, type ListDetail, type Species, type Variant, type VariantKind } from '@mydexpogo/shared';
import { AddToListSheet, groupVariants, type VariantGroup } from './AddToList.js';
import { ImportSearch } from './ImportSearch.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Badge, Button, Chip, Empty, Sheet } from './ui.js';
import { buildQuickEntries, useAddPrefs, type AddGenderPref, type AddVersionPref } from '../lib/addPrefs.js';
import { normalize, type DatasetIndex } from '../lib/dataset.js';
import { matchesDexToken, suggestListTag } from '../lib/dexSearch.js';
import { errorMessage } from '../lib/errors.js';
import { feedback } from '../lib/feedback.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { LIST_TEMPLATES, buildTemplateEntries, type ListTemplateId } from '../lib/listTemplates.js';
import { useRemoveEntries, useUpsertEntries } from '../lib/lists.js';
import { isRecent } from '../pages/PokedexPage.js';

type QuickTab = 'search' | 'import' | 'templates';
const KIND_TABS: ('all' | VariantKind)[] = ['all', 'base', 'costume', 'form', 'regional', 'mega', 'gmax'];
const MAX_SHOWN = 72;

/** Compact remembered presets bar (Normal/Shiny/Both, ♂♀/♂/♀, Missing/Caught, Trait) shared by QuickAddSheet and Pokédex 1-tap mode. */
export function AddPresetsBar({
  tagOverride,
  onTagChange,
  compact = false,
}: {
  tagOverride?: EntryTag;
  onTagChange?: (tg: EntryTag) => void;
  compact?: boolean;
}) {
  const t = useT();
  const [prefs, setPrefs] = useAddPrefs();
  const activeTag = tagOverride !== undefined ? tagOverride : prefs.tag;
  const setTag = (tg: EntryTag) => {
    setPrefs({ tag: tg });
    onTagChange?.(tg);
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'rounded-2xl bg-paper-2/60 p-2'}`} aria-label={t.quick_add_presets}>
      {/* Normal / Shiny / Both */}
      <span className="inline-flex rounded-full bg-card p-0.5 ring-1 ring-line">
        {([
          ['normal', t.normal],
          ['shiny', t.shiny],
          ['both', t.add_version_both],
        ] as [AddVersionPref, string][]).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={prefs.version === v}
            onClick={() => setPrefs({ version: v })}
            className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition ${
              prefs.version === v
                ? v === 'shiny' ? 'bg-shiny text-on-shiny' : 'bg-ink text-card'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {v === 'shiny' && <Sparkle className="h-3 w-3" />}
            {label}
          </button>
        ))}
      </span>

      {/* Gender */}
      <span className="inline-flex rounded-full bg-card p-0.5 ring-1 ring-line">
        {([
          ['both', '♂♀', t.gender_both],
          ['m', '♂', t.male],
          ['f', '♀', t.female],
        ] as [AddGenderPref, string, string][]).map(([g, sym, label]) => (
          <button
            key={g}
            type="button"
            aria-pressed={prefs.gender === g}
            aria-label={label}
            title={label}
            onClick={() => setPrefs({ gender: g })}
            className={`inline-flex min-h-7 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold transition ${
              prefs.gender === g ? 'bg-ink text-card' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {sym}
          </button>
        ))}
      </span>

      {/* Initial status: Missing vs Already caught */}
      <span className="inline-flex rounded-full bg-card p-0.5 ring-1 ring-line">
        <button
          type="button"
          aria-pressed={!prefs.done}
          onClick={() => setPrefs({ done: false })}
          className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold transition ${
            !prefs.done ? 'bg-ink text-card' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {t.add_status_missing}
        </button>
        <button
          type="button"
          aria-pressed={prefs.done}
          onClick={() => setPrefs({ done: true })}
          className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition ${
            prefs.done ? 'bg-go text-white' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
          {t.add_status_caught}
        </button>
      </span>

      {/* Trait selector */}
      <label className="inline-flex items-center">
        <span className="sr-only">{t.trait}</span>
        <select
          value={activeTag}
          onChange={(e) => setTag(e.target.value as EntryTag)}
          aria-label={t.trait}
          className={`min-h-8 rounded-full border px-2.5 text-xs font-semibold transition ${
            activeTag ? 'border-go bg-go-soft text-go-ink' : 'border-line bg-card text-ink-2'
          }`}
        >
          {ENTRY_TAGS.map((tg) => (
            <option key={tg} value={tg}>
              {tg ? t[`tag_${tg}`] : `${t.trait} : ${t.tag_}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * In-collection quick-add drawer: instant search + 1-tap toggle add/remove with remembered presets,
 * plus direct tabs for game-search import and starter templates, and a 1-tap escape hatch to the full Pokédex.
 */
export function QuickAddSheet({
  open,
  initialTab = 'search',
  idx,
  list,
  onClose,
}: {
  open: boolean;
  initialTab?: QuickTab;
  idx: DatasetIndex;
  list: ListDetail;
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const upsert = useUpsertEntries();
  const remove = useRemoveEntries();
  const [prefs] = useAddPrefs();

  const [tab, setTab] = useState<QuickTab>(initialTab);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | VariantKind>('all');
  const [hideInList, setHideInList] = useState(false);
  const [shownLimit, setShownLimit] = useState(MAX_SHOWN);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [sessionAdded, setSessionAdded] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [fineTuning, setFineTuning] = useState<VariantGroup | null>(null);
  const [templateBusy, setTemplateBusy] = useState<ListTemplateId | null>(null);

  const suggestedTag = useMemo(() => suggestListTag(list.entries), [list.entries]);
  const [activeTag, setActiveTag] = useState<EntryTag>(suggestedTag || prefs.tag);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSessionAdded(0);
    setShownLimit(MAX_SHOWN);
    setActiveTag(suggestedTag || prefs.tag);
  }, [open, initialTab, list.id]);

  const q = useDeferredValue(normalize(query));
  useEffect(() => {
    setShownLimit(MAX_SHOWN);
  }, [q, kind, hideInList]);

  /** Fast lookup of existing entries in this collection: `${variantKey}|${gender}|${shiny?1:0}|${tag}` -> { done, note }. */
  const existingMap = useMemo(() => {
    const map = new Map<string, { done: boolean; note: string | null }>();
    for (const e of list.entries) {
      map.set(`${neutralKey(e.variantKey)}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`, { done: e.done, note: e.note ?? null });
    }
    return map;
  }, [list.entries]);

  /** Costume and form labels indexed by dex for keyword search ("sorcière", "galar", …). */
  const labelText = useMemo(() => {
    const out = new Map<number, string>();
    for (const [dex, vs] of idx.variantsByDex) {
      out.set(dex, normalize(vs.map((v) => `${v.label?.en ?? ''} ${v.label?.fr ?? ''}`).join(' ')));
    }
    return out;
  }, [idx]);

  const statusOf = (group: VariantGroup): 'caught' | 'present' | false => {
    const built = buildQuickEntries(idx, group, {
      version: prefs.version,
      gender: prefs.gender,
      tags: [activeTag],
      done: prefs.done,
    });
    if (!built.length) return false;
    let matched = 0;
    let caught = 0;
    for (const e of built) {
      const st = existingMap.get(`${e.variantKey}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`);
      if (st !== undefined) {
        matched++;
        if (st.done) caught++;
      }
    }
    if (matched < built.length) return false;
    return caught === built.length ? 'caught' : 'present';
  };

  const { items, totalMatched, isRecentFallback } = useMemo(() => {
    const words = q ? q.split(/\s+/).filter(Boolean) : [];
    const familyCache = new Map<string, Set<string>>();
    const out: { species: Species; group: VariantGroup; id: string; firstSeen: string }[] = [];

    const wantsRecent = !words.length && kind === 'all';

    for (const sp of idx.ds.species) {
      if (words.length && !words.some((w) => matchesDexToken(idx, sp.dex, w, labelText, familyCache))) continue;
      const vs = (idx.variantsByDex.get(sp.dex) ?? []).filter((v) => {
        if (kind !== 'all' && v.kind !== kind) return false;
        if (wantsRecent && (!isRecent(v.firstSeen) || v.datamined)) return false;
        return true;
      });
      for (const group of groupVariants(vs)) {
        if (words.length) {
          const hay = normalize(`${sp.dex} ${sp.name.en} ${sp.name.fr ?? ''} ${group.label?.en ?? ''} ${group.label?.fr ?? ''}`);
          if (!words.every((w) => matchesDexToken(idx, sp.dex, w, undefined, familyCache) || hay.includes(w))) continue;
        }
        if (hideInList && statusOf(group)) continue;
        const firstSeen = group.variants.reduce((m, v) => (v.firstSeen && v.firstSeen > m ? v.firstSeen : m), '');
        out.push({ species: sp, group, id: `${sp.dex}-${group.id}`, firstSeen });
      }
    }

    if (wantsRecent && out.length > 0) {
      out.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.species.dex - b.species.dex);
      return { items: out.slice(0, shownLimit), totalMatched: out.length, isRecentFallback: true };
    }

    if (wantsRecent && out.length === 0) {
      // Fallback when no variant has a recent timestamp: show base species from #1 onwards.
      const base: { species: Species; group: VariantGroup; id: string; firstSeen: string }[] = [];
      for (const sp of idx.ds.species) {
        const vs = (idx.variantsByDex.get(sp.dex) ?? []).filter((v) => v.kind === 'base');
        const g = groupVariants(vs)[0];
        if (!g) continue;
        if (hideInList && statusOf(g)) continue;
        base.push({ species: sp, group: g, id: `${sp.dex}-${g.id}`, firstSeen: '' });
      }
      return { items: base.slice(0, shownLimit), totalMatched: base.length, isRecentFallback: false };
    }

    return { items: out.slice(0, shownLimit), totalMatched: out.length, isRecentFallback: false };
  }, [idx, q, kind, hideInList, shownLimit, labelText, existingMap, prefs.version, prefs.gender, prefs.done, activeTag]);

  const toggleQuick = async (sp: Species, group: VariantGroup, id: string) => {
    if (busyKey) return;
    const entries = buildQuickEntries(idx, group, {
      version: prefs.version,
      gender: prefs.gender,
      tags: [activeTag],
      done: prefs.done,
    });
    if (!entries.length) return;
    const alreadyIn = !!statusOf(group);
    const label = `${localized(sp.name, lang)}${group.label ? ` (${localized(group.label, lang)})` : ''}`;
    setBusyKey(id);
    try {
      if (alreadyIn) {
        const prevRows = entries.map((e) => {
          const prev = existingMap.get(`${e.variantKey}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`);
          return { ...e, done: prev?.done ?? false, note: prev?.note ?? null };
        });
        await remove.mutateAsync({
          id: list.id,
          entries: entries.map(({ variantKey, gender, shiny, tag }) => ({ variantKey, gender, shiny, tag })),
        });
        feedback('untick');
        setSessionAdded((n) => Math.max(0, n - entries.length));
        toast(t.quick_add_removed_one(label), {
          action: { label: t.undo, onClick: () => void upsert.mutateAsync({ id: list.id, entries: prevRows }) },
        });
      } else {
        await upsert.mutateAsync({ id: list.id, entries });
        feedback('tick');
        setSessionAdded((n) => n + entries.length);
        toast(t.quick_add_added_one(label), {
          action: {
            label: t.undo,
            onClick: () =>
              void remove.mutateAsync({
                id: list.id,
                entries: entries.map(({ variantKey, gender, shiny, tag }) => ({ variantKey, gender, shiny, tag })),
              }),
          },
        });
      }
    } catch (e) {
      toast(errorMessage(t, e));
    } finally {
      setBusyKey(null);
    }
  };

  const applyTemplate = async (tid: ListTemplateId) => {
    const raw = buildTemplateEntries(idx, tid);
    if (!raw.length) return;
    const entries = raw.map((e) => ({ ...e, done: prefs.done }));
    setTemplateBusy(tid);
    try {
      for (let k = 0; k < entries.length; k += 1000) {
        await upsert.mutateAsync({ id: list.id, entries: entries.slice(k, k + 1000), insertOnly: true });
      }
      feedback('tick');
      setSessionAdded((n) => n + entries.length);
      toast(t.template_count(entries.length));
    } catch (e) {
      toast(errorMessage(t, e));
    } finally {
      setTemplateBusy(null);
    }
  };

  const showShinySprite = prefs.version === 'shiny';

  const footer = open ? (
    <div className="flex items-center gap-2">
      <Link
        to={`/dex?to=${list.id}`}
        onClick={onClose}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-paper-2 px-3.5 text-sm font-semibold text-ink transition hover:brightness-95 dark:hover:brightness-110"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h6m6 0h6" /><circle cx="12" cy="12" r="3" /></svg>
        {t.quick_add_open_dex}
      </Link>
      <div className="min-w-0 flex-1 text-right">
        {sessionAdded > 0 && (
          <span className="tnum inline-flex items-center rounded-full bg-go-soft px-2.5 py-1 text-xs font-bold text-go-ink">
            {t.quick_add_session_added(sessionAdded)}
          </span>
        )}
      </div>
      <Button tone="primary" className="shrink-0" onClick={onClose}>
        {t.pick_done}
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <Sheet open={open} onClose={onClose} title={t.quick_add_title(list.name)} footer={footer}>
        {open && (
          <div className="space-y-3">
            {/* Mode tabs: Search / Import / Templates */}
            <div className="flex gap-1.5" role="tablist">
              {([
                ['search', t.quick_add_tab_search],
                ['import', t.quick_add_tab_import],
                ['templates', t.quick_add_tab_templates],
              ] as [QuickTab, string][]).map(([id, label]) => (
                <Chip key={id} role="tab" aria-selected={tab === id} active={tab === id} onClick={() => setTab(id)} className="min-h-8 px-3 text-xs">
                  {label}
                </Chip>
              ))}
            </div>

            {tab === 'search' && (
              <>
                <div className="relative">
                  <input
                    type="search"
                    inputMode="search"
                    autoFocus={typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches}
                    placeholder={t.search_placeholder}
                    aria-label={t.search_placeholder}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-line bg-card px-3 pr-10 text-[16px] text-ink placeholder:text-ink-3 focus:border-sky"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label={t.search_clear}
                      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                {/* Compact mobile preset summary (expands on tap); always open on larger screens */}
                <div className="sm:hidden">
                  <button
                    type="button"
                    aria-expanded={presetsOpen}
                    onClick={() => setPresetsOpen((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-xl bg-paper-2/70 px-3 py-1.5 text-left text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {prefs.version === 'shiny' ? `✨ ${t.shiny}` : prefs.version === 'both' ? t.add_version_both : t.normal}
                      {' · '}
                      {prefs.gender === 'm' ? '♂' : prefs.gender === 'f' ? '♀' : '♂♀'}
                      {' · '}
                      {prefs.done ? `✓ ${t.add_status_caught}` : t.add_status_missing}
                      {activeTag ? ` · ${t[`tag_${activeTag as ''}`] ?? activeTag}` : ''}
                    </span>
                    <span className="shrink-0 font-semibold text-sky">{t.quick_add_presets_edit} {presetsOpen ? '▴' : '▾'}</span>
                  </button>
                  {presetsOpen && (
                    <div className="mt-1.5">
                      <AddPresetsBar tagOverride={activeTag} onTagChange={setActiveTag} />
                    </div>
                  )}
                </div>
                <div className="hidden sm:block">
                  <AddPresetsBar tagOverride={activeTag} onTagChange={setActiveTag} />
                </div>

                {/* Category filter strip + hide already added */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
                  {KIND_TABS.map((k) => (
                    <Chip key={k} active={kind === k} onClick={() => setKind(k)} className="min-h-8 px-2.5 text-xs">
                      {k === 'all' ? t.filter_all : t.kinds[k]}
                    </Chip>
                  ))}
                  <Chip active={hideInList} onClick={() => setHideInList((v) => !v)} className="min-h-8 px-2.5 text-xs">
                    {t.hide_already_in}
                  </Chip>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
                  <span>{isRecentFallback ? t.quick_add_recent : t.quick_add_hint}</span>
                  <span className="tnum shrink-0 font-semibold">{t.variants_count(totalMatched)}</span>
                </div>

                {items.length === 0 ? (
                  <Empty>{t.nothing_here}</Empty>
                ) : (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {items.map(({ species, group, id }) => {
                      const st = statusOf(group);
                      const v = group.variants.find((x) => (prefs.gender === 'f' ? x.gender === 'f' : x.gender !== 'f')) ?? group.variants[0]!;
                      const spName = localized(species.name, lang);
                      const lbl = localized(group.label, lang);
                      const busy = busyKey === id;
                      return (
                        <li key={id} className="relative">
                          <button
                            type="button"
                            disabled={busy}
                            aria-pressed={!!st}
                            aria-label={`${t.add} ${spName}${lbl ? ` ${lbl}` : ''}`}
                            onClick={() => void toggleQuick(species, group, id)}
                            className={`flex h-full w-full flex-col items-center rounded-card border-2 px-1.5 pb-2 pt-2 text-center transition active:scale-[0.97] ${
                              st === 'caught'
                                ? 'border-go bg-go-soft/55'
                                : st === 'present'
                                  ? 'border-sky bg-sky/10'
                                  : 'border-line bg-card hover:border-ink-3'
                            } ${busy ? 'opacity-60' : ''}`}
                          >
                            <span className="relative">
                              <Sprite idx={idx} variant={v} shiny={showShinySprite && v.hasShiny} size={64} />
                              {(showShinySprite || prefs.version === 'both') && v.hasShiny && (
                                <Sparkle className="absolute -right-1 top-0 text-shiny" />
                              )}
                              {st && (
                                <span
                                  className={`pop absolute -left-1 bottom-0 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                                    st === 'caught' ? 'bg-go' : 'bg-sky'
                                  }`}
                                >
                                  ✓
                                </span>
                              )}
                            </span>
                            <span className="mt-1 w-full truncate text-[12px] font-bold leading-tight">{spName}</span>
                            {lbl && <span className="line-clamp-1 w-full text-[10px] leading-tight text-ink-2">{lbl}</span>}
                            {st && (
                              <span className={`mt-1 text-[10px] font-bold ${st === 'caught' ? 'text-go-ink' : 'text-sky'}`}>
                                {st === 'caught' ? t.already_caught_short : t.already_in_list}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFineTuning(group);
                            }}
                            aria-label={`${t.quick_add_fine_tune} ${spName}${lbl ? ` ${lbl}` : ''}`}
                            title={t.quick_add_fine_tune}
                            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-ink-3 transition hover:bg-paper-2 hover:text-ink"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {totalMatched > shownLimit && (
                  <div className="pt-1 text-center">
                    <Button tone="quiet" className="min-h-9 px-4 text-xs" onClick={() => setShownLimit((n) => n + MAX_SHOWN)}>
                      {t.quick_add_show_more(totalMatched - shownLimit)}
                    </Button>
                  </div>
                )}
              </>
            )}

            {tab === 'import' && (
              <ImportSearch idx={idx} list={list} onDone={onClose} />
            )}

            {tab === 'templates' && (
              <div className="space-y-3">
                <p className="text-sm text-ink-2">{t.template_hint}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {LIST_TEMPLATES.filter((tid) => tid !== 'empty').map((tid) => {
                    const isBusy = templateBusy === tid;
                    return (
                      <button
                        key={tid}
                        type="button"
                        disabled={templateBusy !== null}
                        onClick={() => void applyTemplate(tid)}
                        className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-left text-sm font-semibold text-ink transition hover:border-go hover:bg-go-soft/30 disabled:opacity-50"
                      >
                        <span className="truncate">{t.templates[tid]}</span>
                        <Badge tone="grass">{isBusy ? t.template_filling : `+ ${t.add}`}</Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <AddToListSheet
        idx={idx}
        group={fineTuning}
        initialShiny={prefs.version === 'shiny'}
        targetListId={list.id}
        defaultTag={activeTag}
        onAdded={(n) => setSessionAdded((prev) => prev + n)}
        onClose={() => setFineTuning(null)}
      />
    </>
  );
}
