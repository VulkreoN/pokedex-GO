import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AddToListSheet, groupVariants, type VariantGroup } from '../components/AddToList.js';
import { ManagerSheet } from '../components/ManagerSheet.js';
import { useMe } from '../lib/auth.js';
import { Sparkle } from '../components/Sprite.js';
import { VariantCard } from '../components/VariantCard.js';
import { Badge, Button, Chip, Empty, Sheet, Spinner, TopBar } from '../components/ui.js';
import { useToast } from '../components/toast.js';
import { api } from '../lib/api.js';
import { neutralKey } from '@mydexpogo/shared';
import { normalize, useDataset } from '../lib/dataset.js';
import { LeagueIcon } from '../components/PvpTops.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { TypeBadge } from '../components/TypeBadge.js';
import { useFeedbackPref } from '../lib/feedback.js';


export function SpeciesPage() {
  const t = useT();
  const { lang } = useLang();
  const dex = Number(useParams().dex);
  const dataset = useDataset();
  const [shiny, setShiny] = useState(false);
  const [adding, setAdding] = useState<VariantGroup | null>(null);
  const [managing, setManaging] = useState<VariantGroup | null>(null);
  const [query, setQuery] = useState('');
  const [reporting, setReporting] = useState(false);
  const me = useMe();
  const isManager = me.data?.role === 'manager' || me.data?.role === 'admin';
  const idx = dataset.data;
  const species = idx?.speciesByDex.get(dex);
  const variants = useMemo(() => idx?.variantsByDex.get(dex) ?? [], [idx, dex]);

  const sections = useMemo(() => {
    const by = (kinds: string[]) => groupVariants(variants.filter((v) => kinds.includes(v.kind)));
    return [
      [t.normal, by(['base'])],
      [t.filter_regional, by(['regional'])],
      [t.filter_forms, by(['form'])],
      [t.filter_costumes, by(['costume'])],
      [t.filter_mega, by(['mega', 'gmax'])],
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

  if (dataset.isPending) return <Spinner />;
  if (!idx || !species) return <Empty>{t.err_not_found}</Empty>;
  const prev = idx.speciesByDex.get(dex - 1);
  const next = idx.speciesByDex.get(dex + 1);

  return (
    <>
      <TopBar
        title={<span><span className="tnum mr-2 text-ink-3">#{dex}</span>{' '}{localized(species.name, lang)}</span>}
        back
        actions={
          <div className="flex">
            {prev && <Link to={`/dex/${prev.dex}`} className="tnum px-2 py-2 text-sm font-semibold text-ink-2" aria-label={localized(prev.name, lang)}>‹ {prev.dex}</Link>}
            {next && <Link to={`/dex/${next.dex}`} className="tnum px-2 py-2 text-sm font-semibold text-ink-2" aria-label={localized(next.name, lang)}>{next.dex} ›</Link>}
          </div>
        }
      />
      <main className="mx-auto max-w-3xl px-3 pb-24">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {species.types.map((ty) => (
            <TypeBadge key={ty} type={ty} />
          ))}
          {species.rarity !== 'normal' && <Badge tone="muted">{t[`rarity_${species.rarity}`]}</Badge>}
          {!species.released && <Badge tone="datamined">{t.unreleased_species}</Badge>}
          {species.shinyReleased === false && <Badge tone="muted">{t.no_shiny}</Badge>}
          <CryButton dex={dex} name={localized(species.name, lang)} />
          {idx.pvpByKey.has(String(dex)) && (
            <Link to={`/pvp/${dex}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-semibold text-ink-2 hover:border-ink-3">
              <LeagueIcon league="great" size={16} />
              PvP
            </Link>
          )}
          <span className="ml-auto" />
          <Chip active={!shiny} onClick={() => setShiny(false)}>{t.normal}</Chip>
          <Chip active={shiny} onClick={() => setShiny(true)}>
            <Sparkle className={shiny ? 'text-shiny' : ''} /> {t.shiny}
          </Chip>
        </div>

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
            <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none]" aria-label={t.sections}>
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
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {groups.map((g) => (
                  <li key={g.id}>
                    <VariantCard idx={idx} species={species} group={g} shiny={shiny} onAdd={setAdding} onManage={isManager ? setManaging : undefined} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
        {variants.some((v) => v.datamined) && <p className="text-xs text-ink-3">{t.datamined_hint}</p>}
        {me.data && (
          <button type="button" onClick={() => setReporting(true)} className="mt-4 text-sm font-semibold text-ink-3 underline hover:text-ink-2">{t.report_button}</button>
        )}
      </main>
      <AddToListSheet idx={idx} group={adding} initialShiny={shiny} onClose={() => setAdding(null)} />
      <ReportSheet open={reporting} onClose={() => setReporting(false)} groups={sections.flatMap(([title, g]) => g.map((x) => ({ key: x.variants[0]!.key, label: x.label ? localized(x.label, lang) : title })))} />
      {isManager && <ManagerSheet group={managing} onClose={() => setManaging(null)} />}
    </>
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
    </Sheet>
  );
}

/** Plays the Pokémon's cry (PokeAPI recordings), unless sounds are switched off in Me. */
function CryButton({ dex, name }: { dex: number; name: string }) {
  const t = useT();
  const sounds = useFeedbackPref('sounds');
  const [playing, setPlaying] = useState(false);
  if (!sounds) return null;
  const play = () => {
    const audio = new Audio(`https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dex}.ogg`);
    audio.volume = 0.5;
    setPlaying(true);
    audio.onended = audio.onerror = () => setPlaying(false);
    void audio.play().catch(() => setPlaying(false));
  };
  return (
    <button type="button" onClick={play} aria-label={t.cry(name)} title={t.cry(name)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm font-semibold text-ink-2 transition hover:border-ink-3 active:scale-[0.96] ${playing ? 'border-sky text-sky' : ''}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={playing ? 'pop' : ''}><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
      {t.cry_short}
    </button>
  );
}
