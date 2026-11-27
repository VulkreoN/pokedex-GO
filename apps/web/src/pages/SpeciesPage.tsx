import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { defaultPick, type DexPick } from '../components/BulkAddSheet.js';
import { ManagerSheet } from '../components/ManagerSheet.js';
import { AddPresetsBar } from '../components/QuickAddSheet.js';
import { picksFromSelection } from '../components/SelectionBar.js';
import { buildQuickEntries, useAddPrefs } from '../lib/addPrefs.js';
import { useMe } from '../lib/auth.js';
import { useBulkOverride, useOverrides, type Override } from '../lib/admin.js';
import { Sparkle } from '../components/Sprite.js';
import { VariantCard, type GenderFilter } from '../components/VariantCard.js';
import { Badge, Button, Chip, Empty, Sheet, Spinner, TopBar } from '../components/ui.js';
import { PageTourButton } from '../components/PageTour.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { eventTitle, neutralKey } from '@mydexpogo/shared';
import { normalize, useDataset } from '../lib/dataset.js';
import { liveAppearancesOf, suggestListTag } from '../lib/dexSearch.js';
import { errorMessage } from '../lib/errors.js';
import { LeagueIcon } from '../components/PvpTops.js';
import { localized, typeName, useLang, useT } from '../lib/i18n.js';
import { useList, useMembership, useRemoveEntries, useUpsertEntries } from '../lib/lists.js';
import { useEggs, useEvents, useRaids, useResearch } from '../lib/live.js';
import { selection, useSelection } from '../lib/selection.js';
import { rocketName, useRockets } from '../lib/tools.js';
import { TypeBadge } from '../components/TypeBadge.js';
import { EvolutionCard, useEventSpawns } from '../components/GameTools.js';
import { feedback, useFeedbackPref } from '../lib/feedback.js';

export function SpeciesPage() {
  const t = useT();
  const { lang } = useLang();
  const dex = Number(useParams().dex);
  const [searchParams] = useSearchParams();
  const targetListId = searchParams.get('to') || undefined;
  const dataset = useDataset();
  const [shiny, setShiny] = useState(false);
  const [gender, setGender] = useState<GenderFilter>('all');
  const [multi, setMulti] = useState(false);
  const selectedItems = useSelection();
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const [managing, setManaging] = useState<VariantGroup | null>(null);
  const [query, setQuery] = useState('');
  const [reporting, setReporting] = useState(false);
  const [prefs, setPrefs] = useAddPrefs();
  const upsert = useUpsertEntries();
  const remove = useRemoveEntries();
  const me = useMe();
  const isManager = me.data?.role === 'manager' || me.data?.role === 'admin';
  const toast = useToast();
  const overrides = useOverrides(isManager);
  const bulkOverride = useBulkOverride();
  const idx = dataset.data;
  const picksMap = useMemo(
    () => (idx ? picksFromSelection(idx, selectedItems) : new Map<string, DexPick>()),
    [idx, selectedItems],
  );
  const species = idx?.speciesByDex.get(dex);
  const variants = useMemo(() => idx?.variantsByDex.get(dex) ?? [], [idx, dex]);
  const hiddenGroups = useMemo(() => {
    if (!isManager) return [];
    const grouped = new Map<string, { keys: string[]; sample: Override }>();
    for (const o of overrides.data ?? []) {
      if (o.hidden !== true) continue;
      if (Number(o.variantKey.split('.')[0]) !== dex) continue;
      const nk = neutralKey(o.variantKey);
      const cur = grouped.get(nk);
      if (cur) cur.keys.push(o.variantKey);
      else grouped.set(nk, { keys: [o.variantKey], sample: o });
    }
    return [...grouped.entries()].map(([key, v]) => ({ key, ...v }));
  }, [isManager, overrides.data, dex]);

  const targetQuery = useList(targetListId ?? '', !!targetListId && !!me.data);
  const targetList = targetQuery.data?.access === 'owner' ? targetQuery.data.list : undefined;
  const targetDefaultTag = useMemo(() => (targetList ? suggestListTag(targetList.entries) : ''), [targetList]);
  const oneTapActive = !!targetList && prefs.oneTap && !multi;
  const membership = useMembership(!!me.data && !targetListId);

  const targetEntryMap = useMemo(() => {
    const map = new Map<string, { done: boolean; note: string | null }>();
    if (!targetList) return map;
    for (const e of targetList.entries) {
      map.set(`${neutralKey(e.variantKey)}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`, { done: e.done, note: e.note ?? null });
    }
    return map;
  }, [targetList]);

  const effectiveShiny = oneTapActive ? prefs.version === 'shiny' : shiny;
  const variantStatus = useMemo(() => {
    const out = new Map<string, 'caught' | 'present'>();
    const entries = targetList ? targetList.entries : membership.data;
    if (!entries?.length) return out;
    for (const e of entries) {
      if (e.shiny !== effectiveShiny) continue;
      const k = neutralKey(e.variantKey);
      const prev = out.get(k);
      if (e.done) out.set(k, 'caught');
      else if (!prev) out.set(k, 'present');
    }
    return out;
  }, [targetList, membership.data, effectiveShiny]);

  const quickToggleTarget = async (g: VariantGroup) => {
    if (!targetList || !idx) return;
    const tag = targetDefaultTag || prefs.tag;
    const entries = buildQuickEntries(idx, g, {
      version: prefs.version,
      gender: prefs.gender,
      tags: [tag],
      done: prefs.done,
    });
    if (!entries.length) return;
    const name = `${species ? localized(species.name, lang) : ''}${g.label ? ` (${localized(g.label, lang)})` : ''}`.trim();
    const allIn = entries.every((e) => targetEntryMap.has(`${e.variantKey}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`));
    try {
      if (allIn) {
        const prevRows = entries.map((e) => {
          const prev = targetEntryMap.get(`${e.variantKey}|${e.gender}|${e.shiny ? 1 : 0}|${e.tag}`);
          return { ...e, done: prev?.done ?? false, note: prev?.note ?? null };
        });
        await remove.mutateAsync({
          id: targetList.id,
          entries: entries.map(({ variantKey, gender: gd, shiny: sh, tag: tg }) => ({ variantKey, gender: gd, shiny: sh, tag: tg })),
        });
        feedback('untick');
        toast(t.quick_add_removed_one(name), {
          action: { label: t.undo, onClick: () => void upsert.mutateAsync({ id: targetList.id, entries: prevRows }) },
        });
      } else {
        await upsert.mutateAsync({ id: targetList.id, entries });
        feedback('tick');
        toast(t.quick_add_added_one(name), {
          action: {
            label: t.undo,
            onClick: () =>
              void remove.mutateAsync({
                id: targetList.id,
                entries: entries.map(({ variantKey, gender: gd, shiny: sh, tag: tg }) => ({ variantKey, gender: gd, shiny: sh, tag: tg })),
              }),
          },
        });
      }
    } catch (e) {
      toast(errorMessage(t, e));
    }
  };

  const hasFemaleArt = useMemo(() => variants.some((v) => v.gender === 'f'), [variants]);

  const sections = useMemo(() => {
    const by = (kinds: string[]) => groupVariants(variants.filter((v) => kinds.includes(v.kind)));
    return [
      [t.normal, by(['base'])],
      [t.filter_regional, by(['regional'])],
      [t.filter_forms, by(['form'])],
      [t.filter_costumes, by(['costume'])],
      [t.kinds.mega, by(['mega'])],
      [t.kinds.gmax, by(['gmax'])],
    ] as [string, VariantGroup[]][];
  }, [variants, t]);
  const total = sections.reduce((n, [, g]) => n + g.length, 0);
  /** Pikachu has over a hundred costumes: past a couple of screens, a search and jumps to each section. */
  const long = total > 24;
  const q = normalize(query);
  const shown = useMemo(
    () => sections.map(([title, groups]) => [title, q ? groups.filter((g) => normalize(`${g.label?.fr ?? ''} ${g.label?.en ?? ''} ${title}`).includes(q)) : groups] as [string, VariantGroup[]]),
    [sections, q],
  );
  const visibleGroups = useMemo(() => shown.flatMap(([, groups]) => groups), [shown]);

  const baseKeyOf = (g: VariantGroup) => neutralKey((g.variants.find((x) => x.gender !== 'f') ?? g.variants[0]!).key);
  const savePick = (g: VariantGroup, p: DexPick) => {
    const bk = baseKeyOf(g);
    selection.replaceVariant(bk, p.combos.map((c) => ({ variantKey: bk, gender: c.sex, shiny: c.shiny, tag: '' })));
  };
  const toggleTick = (g: VariantGroup) => {
    const bk = baseKeyOf(g);
    const was = picksMap.has(bk);
    feedback(was ? 'untick' : 'tick');
    if (was) selection.removeVariant(bk);
    else savePick(g, defaultPick(g, gender, effectiveShiny));
  };

  if (dataset.isPending) return <Spinner />;
  if (!idx || !species) return <Empty>{t.err_not_found}</Empty>;
  const prev = idx.speciesByDex.get(dex - 1);
  const next = idx.speciesByDex.get(dex + 1);
  const suffix = targetList ? `?to=${targetList.id}` : '';

  return (
    <>
      <TopBar
        title={<span><span className="tnum mr-2 opacity-60">#{dex}</span>{' '}{localized(species.name, lang)}</span>}
        back
        actions={
          <div className="flex items-center">
            {prev && <Link to={`/dex/${prev.dex}${suffix}`} className="tnum px-2 py-2 text-sm font-semibold text-ink-2" aria-label={localized(prev.name, lang)}>‹ {prev.dex}</Link>}
            {next && <Link to={`/dex/${next.dex}${suffix}`} className="tnum px-2 py-2 text-sm font-semibold text-ink-2" aria-label={localized(next.name, lang)}>{next.dex} ›</Link>}
            <PageTourButton page="dex" />
          </div>
        }
      />
      <main className="mx-auto max-w-6xl px-3 pb-28 sm:px-5">
        {targetList && (
          <div className="mb-3 space-y-1.5 rounded-xl bg-go-soft px-3 py-2 text-xs font-semibold text-go-ink">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{t.adding_to_banner(targetList.name)}</span>
              <button
                type="button"
                aria-pressed={prefs.oneTap}
                onClick={() => setPrefs({ oneTap: !prefs.oneTap })}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition ${prefs.oneTap ? 'bg-go text-white' : 'bg-card/85 text-go-ink'}`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /></svg>
                {t.quick_add_one_tap}
              </button>
              <Link to={`/lists/${targetList.id}`} className="shrink-0 underline">{t.adding_to_back}</Link>
            </div>
            {oneTapActive && (
              <div className="pt-0.5">
                <AddPresetsBar compact />
              </div>
            )}
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {species.types.map((ty) => (
            <TypeBadge key={ty} type={ty} />
          ))}
          {species.rarity !== 'normal' && <Badge tone="muted">{t[`rarity_${species.rarity}`]}</Badge>}
          {!species.released && <Badge tone="datamined">{t.unreleased_species}</Badge>}
          {species.shinyReleased === false && <Badge tone="muted">{t.no_shiny}</Badge>}
          {idx.pvpByKey.has(String(dex)) && (
            <Link to={`/pvp/${dex}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-semibold text-ink-2 hover:border-ink-3">
              <LeagueIcon league="great" size={16} />
              PvP
            </Link>
          )}
          {/* Right side: cry, optional ♂/♀ art toggle, normal / shiny switch, and multi-select when several variants exist. */}
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <CryButton dex={dex} name={localized(species.name, lang)} english={species.name.en} />
            {hasFemaleArt && (
              <span className="inline-flex rounded-full bg-paper-2 p-0.5">
                {(['m', 'f'] as const).map((g) => {
                  const active = gender === g || (gender === 'all' && g === 'm');
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={active}
                      aria-label={g === 'm' ? t.male : t.female}
                      onClick={() => setGender(g)}
                      className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold transition ${active ? 'jelly-on bg-ink text-paper shadow-sm' : 'text-ink-3 hover:text-ink'}`}
                    >
                      {g === 'm' ? '♂' : '♀'}
                    </button>
                  );
                })}
              </span>
            )}
            <span className="inline-flex rounded-full bg-paper-2 p-0.5">
              {([false, true] as const).map((s) => (
                <button
                  key={String(s)}
                  type="button"
                  aria-pressed={effectiveShiny === s}
                  onClick={() => {
                    if (oneTapActive) setPrefs({ version: s ? 'shiny' : 'normal' });
                    else setShiny(s);
                  }}
                  className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition ${effectiveShiny === s ? 'jelly-on bg-ink text-paper shadow-sm' : 'text-ink-3 hover:text-ink'}`}
                >
                  {s && <Sparkle className={effectiveShiny ? 'text-shiny' : ''} />}
                  {s ? t.shiny : t.normal}
                </button>
              ))}
            </span>
            {total > 1 && (
              <Chip active={multi} onClick={() => setMulti((m) => !m)} aria-label={t.multi_select} className="min-h-8 px-2.5 text-xs">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></svg>
                {t.multi_short}
                {picksMap.size > 0 && <span className="tnum rounded-full bg-go px-1.5 text-[10px] font-bold leading-4 text-white">{picksMap.size}</span>}
              </Chip>
            )}
          </span>
        </div>

        <LiveNowCard dex={dex} />
        <EvolutionCard dex={dex} />

        {multi && visibleGroups.length > 0 && (
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink-3">
            <span className="flex-1">{t.multi_hint}</span>
            <button
              type="button"
              className="shrink-0 text-sky"
              onClick={() => {
                const batch = visibleGroups.flatMap((g) => {
                  const bk = baseKeyOf(g);
                  if (picksMap.has(bk)) return [];
                  return defaultPick(g, gender, effectiveShiny).combos.map((co) => ({ variantKey: bk, gender: co.sex, shiny: co.shiny, tag: '' as const }));
                });
                if (batch.length) selection.add(batch);
              }}
            >
              {t.select_all_visible}
            </button>
            <button type="button" className="shrink-0 text-ink-3" onClick={() => selection.clear()}>{t.clear}</button>
          </div>
        )}

        {long && (
          <div className="mb-3 space-y-2">
            <input
              type="search"
              placeholder={t.variant_search}
              aria-label={t.variant_search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] placeholder:text-ink-3 focus:border-sky"
            />
            <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" aria-label={t.sections}>
              {shown.map(([title, groups], i) =>
                groups.length ? (
                  <a key={title} href={`#section-${i}`} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-line bg-card px-3 text-sm font-semibold text-ink-2">
                    {title} <span className="tnum font-normal text-ink-3">{groups.length}</span>
                  </a>
                ) : null,
              )}
            </nav>
          </div>
        )}
        {q && shown.every(([, g]) => g.length === 0) && <Empty>{t.nothing_here}</Empty>}
        {shown.map(([title, groups], i) =>
          groups.length ? (
            <section key={title} id={`section-${i}`} className="mb-5 scroll-mt-20">
              <h2 className="mb-2 text-base font-bold">{title} <span className="tnum font-normal text-ink-3">{groups.length}</span></h2>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {groups.map((g) => {
                  const baseKey = baseKeyOf(g);
                  return (
                    <li key={g.id}>
                      <VariantCard
                        idx={idx}
                        species={species}
                        group={g}
                        shiny={effectiveShiny}
                        gender={gender}
                        selectable={multi}
                        selected={picksMap.has(baseKey)}
                        pick={picksMap.get(baseKey)}
                        onPick={(p) => savePick(g, p)}
                        inCollection={variantStatus.get(baseKey) ?? false}
                        quickMode={oneTapActive}
                        onAdd={(gr) => (multi ? toggleTick(gr) : oneTapActive ? void quickToggleTarget(gr) : setAdding(gr))}
                        onManage={isManager && !multi ? setManaging : undefined}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}
        {variants.some((v) => v.datamined) && <p className="text-xs text-ink-3">{t.datamined_hint}</p>}
        {isManager && hiddenGroups.length > 0 && (
          <details className="card mt-4 border-berry/35 p-3">
            <summary className="cursor-pointer text-sm font-bold text-berry">
              {t.variant_hidden_title(hiddenGroups.length)}
            </summary>
            <ul className="mt-2.5 space-y-2">
              {hiddenGroups.map(({ key, keys, sample }) => {
                const img = sample.meta?.img;
                const src = img ? (/^https?:\/\//.test(img) ? img : `${idx.ds.assetBase}${img}`) : null;
                const label = localized(sample.label ?? sample.meta?.label, lang) || t.normal;
                return (
                  <li key={key} className="flex items-center gap-2.5 rounded-xl border border-line bg-paper/60 p-2">
                    {src && <img src={src} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 object-contain opacity-75" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{label}</p>
                      <p className="truncate font-mono text-[11px] text-ink-3">{key}</p>
                    </div>
                    <Button
                      tone="quiet"
                      className="min-h-8 shrink-0 px-2.5 text-xs"
                      disabled={bulkOverride.isPending}
                      onClick={async () => {
                        await bulkOverride.mutateAsync({ keys, hidden: null });
                        toast(t.variant_restored);
                      }}
                    >
                      {t.variant_restore}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
        {me.data && (
          <button type="button" onClick={() => setReporting(true)} className="mt-4 text-sm font-semibold text-ink-3 underline hover:text-ink-2">{t.report_button}</button>
        )}
      </main>

      <AddToListSheet
        idx={idx}
        group={adding}
        initialShiny={effectiveShiny}
        targetListId={targetList?.id}
        defaultTag={targetList && targetDefaultTag ? targetDefaultTag : undefined}
        onClose={() => setAdding(null)}
      />
      <ReportSheet open={reporting} onClose={() => setReporting(false)} groups={sections.flatMap(([title, g]) => g.map((x) => ({ key: x.variants[0]!.key, label: x.label ? localized(x.label, lang) : title })))} />
      {isManager && <ManagerSheet idx={idx} group={managing} onClose={() => setManaging(null)} />}
    </>
  );
}

/** Shows where this Pokémon is currently obtainable in Pokémon GO (raids, eggs, research, Team GO Rocket, active events). */
function LiveNowCard({ dex }: { dex: number }) {
  const t = useT();
  const { lang } = useLang();
  const idx = useDataset().data;
  const raids = useRaids();
  const events = useEvents();
  const eggs = useEggs();
  const research = useResearch();
  const rockets = useRockets();
  const eventSpawns = useEventSpawns();

  const items = useMemo(
    () =>
      liveAppearancesOf(dex, {
        raids: raids.data,
        events: events.data,
        eggs: eggs.data,
        research: research.data,
        rockets: rockets.data,
        eventSpawns: eventSpawns.data,
      }),
    [dex, raids.data, events.data, eggs.data, research.data, rockets.data, eventSpawns.data],
  );
  if (!items.length) return null;

  const labelOf = (a: (typeof items)[number]) => {
    if (a.kind === 'raid') return t.live_raid(a.detail);
    if (a.kind === 'egg') return t.live_egg(a.detail);
    if (a.kind === 'research') return t.live_research;
    if (a.kind === 'rocket') return t.live_rocket(rocketName(a.detail, lang, (ty) => typeName(ty, lang)));
    return t.live_event(eventTitle(a.detail, idx?.speciesByDex, lang));
  };

  return (
    <section aria-label={t.live_now_title} className="card mb-4 border-sky/40 bg-sky/5 p-3">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-sky">{t.live_now_title}</h2>
      <div className="flex flex-wrap gap-1.5">
        {items.map((a) => (
          <Link
            key={`${a.kind}|${a.detail}`}
            to={a.to}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-card px-2.5 text-xs font-semibold text-ink shadow-sm ring-1 ring-line transition hover:border-sky hover:text-sky"
          >
            {labelOf(a)}
            <span aria-hidden="true" className="opacity-50">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** A player tells the managers something is off on this page: which form, what kind of mistake, a few words. */
function ReportSheet({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: { key: string; label: string }[] }) {
  const t = useT();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<'name' | 'released' | 'gender' | 'picture' | 'other'>('name');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const chosen = key || groups[0]?.key || '';
  const send = async () => {
    setSending(true);
    try {
      await api('/reports', { body: { variantKey: neutralKey(chosen), kind, message: message.trim() || undefined } });
      toast(t.report_sent);
      setMessage('');
      onClose();
    } catch {
      toast(t.err_generic);
    } finally {
      setSending(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t.report_title}>
      {open && (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-2">{t.report_variant}</span>
            <select value={chosen} onChange={(e) => setKey(e.target.value)} className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-[16px] text-ink">
              {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </label>
          <div>
            <p className="mb-1 text-sm font-medium text-ink-2">{t.report_kind}</p>
            <div className="flex flex-wrap gap-1.5">
              {(['name', 'released', 'gender', 'picture', 'other'] as const).map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{t.report_kinds[k]}</Chip>)}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-2">{t.report_message}</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3} className="w-full rounded-xl border border-line bg-card px-3 py-2 text-[16px]" />
          </label>
          <Button tone="primary" className="w-full" disabled={sending || !chosen} onClick={send}>{t.report_send}</Button>
        </div>
      )}
    </Sheet>
  );
}

/** One player for the whole app: a new cry stops the one playing instead of piling up. */
let cryPlayer: HTMLAudioElement | null = null;

/** Showdown's id of a species ("Mr. Mime" -> "mrmime", "Nidoran♀" -> "nidoranf", "Flabébé" -> "flabebe"). */
export const showdownId = (english: string) =>
  english.replace('♀', 'f').replace('♂', 'm').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Plays the Pokémon's cry, unless sounds are switched off in Me. MP3 from Showdown, which every iPhone plays (the
 * PokeAPI recordings are Ogg, which Safari does not reliably), the Ogg one if that fails.
 */
function CryButton({ dex, name, english }: { dex: number; name: string; english: string }) {
  const t = useT();
  const sounds = useFeedbackPref('sounds');
  const [playing, setPlaying] = useState(false);
  if (!sounds) return null;
  const play = () => {
    // Started from the tap itself, as iPhone wants; the one playing stops first.
    cryPlayer?.pause();
    const audio = new Audio(`https://play.pokemonshowdown.com/audio/cries/${showdownId(english)}.mp3`);
    audio.preload = 'auto';
    cryPlayer = audio;
    audio.volume = 0.6;
    setPlaying(true);
    let triedOgg = false;
    let switching = false;
    const done = () => {
      if (cryPlayer === audio) setPlaying(false);
    };
    const tryFallback = (err?: unknown) => {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') return done();
      if (triedOgg || cryPlayer !== audio) return done();
      triedOgg = true;
      switching = true;
      audio.src = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dex}.ogg`;
      void audio.play().catch(() => {
        switching = false;
        done();
      });
    };
    audio.onplaying = () => { switching = false; };
    audio.onended = () => { switching = false; done(); };
    audio.onpause = () => { if (!switching) done(); };
    audio.onerror = () => tryFallback();
    void audio.play().catch((err) => tryFallback(err));
  };
  return (
    <button type="button" onClick={play} aria-label={t.cry(name)} title={t.cry(name)} className={`inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-ink-2 transition hover:bg-paper-2 active:scale-[0.92] ${playing ? 'bg-sky/15 text-sky' : ''}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`pointer-events-none ${playing ? 'pop' : ''}`}><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
    </button>
  );
}
