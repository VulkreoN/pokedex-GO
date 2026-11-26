/**
 * Tiered Trainer Medals (Bronze / Silver / Gold / Platinum) & Collection Progress Stats.
 */
import { useMemo, useState } from 'react';
import { computeCollectionStats, computeMedals, type ListDetail, type Medal, type MedalId, type MedalTier } from '@mydexpogo/shared';
import { Badge, Button, Progress, Sheet } from './ui.js';
import { useMe } from '../lib/auth.js';
import { tagLabel, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { useT } from '../lib/i18n.js';
import { useFriends, useLists, useMembership } from '../lib/lists.js';
import { useMyPvp, usePvpTeams } from '../lib/myPvp.js';

const TIER_STYLES: Record<MedalTier, { bg: string; rim: string; text: string; dot: string }> = {
  0: { bg: 'linear-gradient(145deg, #cbd5e1, #94a3b8)', rim: '#94a3b8', text: 'text-ink-3', dot: 'bg-ink-3/40' },
  1: { bg: 'linear-gradient(145deg, #e09854, #9c5221)', rim: '#b45309', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-700' },
  2: { bg: 'linear-gradient(145deg, #f1f5f9, #94a3b8)', rim: '#64748b', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' },
  3: { bg: 'linear-gradient(145deg, #fde047, #ca8a04)', rim: '#eab308', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  4: { bg: 'linear-gradient(145deg, #e0f2fe 0%, #c4b5fd 52%, #38bdf8 100%)', rim: '#6366f1', text: 'text-indigo-700 dark:text-sky-300', dot: 'bg-indigo-400' },
};

const MEDAL_GLYPHS: Record<MedalId, string> = {
  collector: '🎒',
  shiny: '✨',
  costume: '🎩',
  regional: '🌍',
  mega_max: '⚡',
  shadow: '😈',
  completed_lists: '🏆',
  friends: '🤝',
  pvp: '⚔️',
  gen_1: 'I',
  gen_2: 'II',
  gen_3: 'III',
  gen_4: 'IV',
  gen_5: 'V',
  gen_6: 'VI',
  gen_7: 'VII',
  gen_8: 'VIII',
  gen_9: 'IX',
};

/** Pokémon GO gym-style hexagonal/shield medal emblem colored by tier (Locked / Bronze / Silver / Gold / Platinum). */
function MedalEmblem({ medal, size = 48 }: { medal: Medal; size?: number }) {
  const s = TIER_STYLES[medal.tier];
  const glyph = MEDAL_GLYPHS[medal.id];
  const isRoman = medal.category === 'region';
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full shadow-sm ${medal.tier === 0 ? 'opacity-45 grayscale' : ''}`}
      style={{
        width: size,
        height: size,
        background: s.bg,
        boxShadow: medal.tier === 4 ? `0 0 0 2px ${s.rim}, 0 0 12px rgba(99,102,241,0.35)` : `0 0 0 2px ${s.rim}`,
      }}
    >
      <span
        className={`flex items-center justify-center rounded-full bg-black/15 font-black text-white drop-shadow-sm ${isRoman ? 'text-xs tracking-tight' : 'text-lg'}`}
        style={{ width: size - 10, height: size - 10 }}
      >
        {glyph}
      </span>
      {medal.tier > 0 && (
        <span
          className="absolute -bottom-1 flex gap-0.5 rounded-full bg-card px-1 py-0.5 shadow"
          style={{ border: `1px solid ${s.rim}` }}
        >
          {[1, 2, 3, 4].map((lv) => (
            <span
              key={lv}
              className={`h-1.5 w-1.5 rounded-full ${lv <= medal.tier ? s.dot : 'bg-line'}`}
            />
          ))}
        </span>
      )}
    </span>
  );
}

export type MedalsSummaryData = ReturnType<typeof computeMedals>;

/** Reusable medals card + interactive modal sheet (used on MePage and Friend profile pages). */
export function MedalsCard({ data, title }: { data: MedalsSummaryData; title?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<MedalId | null>(null);

  const heading = title ?? t.medals_title;
  const allMedals = [...data.core, ...data.regions];
  // Preview top 4 medals: highest tier first, then highest progress toward next tier.
  const preview = [...allMedals]
    .sort((a, b) => b.tier - a.tier || b.progress - a.progress || b.value - a.value)
    .slice(0, 4);
  const selected = (focused ? allMedals.find((m) => m.id === focused) : null) ?? preview[0] ?? data.core[0]!;

  const medalDesc = (m: Medal) =>
    m.category === 'region'
      ? `${t.medal_names[m.id] ?? m.id} · ${m.value} / ${m.thresholds[3]}`
      : t.medal_descs[m.id] ?? '';

  return (
    <>
      <section className="card p-4" aria-label={heading}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-bold">{heading}</h2>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
            {([4, 3, 2, 1] as MedalTier[]).map((tier) =>
              data.summary[tier] > 0 ? (
                <span key={tier} className="tnum inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-ink-2">
                  <span className={`h-2 w-2 rounded-full ${TIER_STYLES[tier].dot}`} aria-hidden="true" />
                  {data.summary[tier]}
                </span>
              ) : null,
            )}
          </div>
        </div>

        <ul className="mt-3 grid grid-cols-4 gap-2">
          {preview.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => { setFocused(m.id); setOpen(true); }}
                className="flex w-full flex-col items-center rounded-xl py-1.5 text-center transition hover:bg-paper-2 active:scale-[0.98]"
              >
                <MedalEmblem medal={m} size={46} />
                <span className="mt-2 w-full truncate text-[11px] font-semibold leading-tight">{t.medal_names[m.id] ?? m.id}</span>
                <span className={`tnum text-[10px] font-bold ${TIER_STYLES[m.tier].text}`}>{t.medals_tiers[m.tier]}</span>
              </button>
            </li>
          ))}
        </ul>

        <Button tone="quiet" className="mt-3 min-h-10 w-full text-sm" onClick={() => setOpen(true)}>
          {t.medals_all}
        </Button>
      </section>

      <Sheet open={open} onClose={() => setOpen(false)} title={heading}>
        {open && (
          <div className="space-y-4">
            {/* Selected medal detail card */}
            <div className="rounded-card border border-line bg-paper-2/50 p-3">
              <div className="flex items-center gap-3">
                <MedalEmblem medal={selected} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">{t.medal_names[selected.id] ?? selected.id}</span>
                    <Badge tone={selected.tier === 4 ? 'datamined' : selected.tier === 3 ? 'shiny' : selected.tier > 0 ? 'grass' : 'muted'}>
                      {t.medals_tiers[selected.tier]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-2">{medalDesc(selected)}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                  <span className="tnum text-ink-2">
                    {selected.next === null ? t.medals_maxed : t.medals_next(selected.value, selected.next)}
                  </span>
                  <span className="tnum font-bold text-ink">{selected.value}</span>
                </div>
                <Progress done={selected.next === null ? 1 : Math.round(selected.progress * 100)} total={selected.next === null ? 1 : 100} />
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-1 text-center text-[10px] font-semibold">
                {selected.thresholds.map((th, i) => {
                  const lv = (i + 1) as MedalTier;
                  const reached = selected.value >= th;
                  return (
                    <div key={lv} className={`tnum rounded-lg py-1 ${reached ? 'bg-go-soft text-go-ink' : 'bg-card text-ink-3'}`}>
                      <div>{t.medals_tiers[lv]}</div>
                      <div className="font-bold">{th}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <MedalGrid title={t.medals_core} medals={data.core} selectedId={selected.id} onSelect={setFocused} />
            <MedalGrid title={t.medals_regions} medals={data.regions} selectedId={selected.id} onSelect={setFocused} />
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Compact summary card on MePage + full modal sheet showing all 9 core & 9 regional medals. */
export function TrainerMedalsCard() {
  const me = useMe();
  const dataset = useDataset();
  const membership = useMembership(!!me.data);
  const lists = useLists();
  const friends = useFriends();
  const myPvp = useMyPvp();
  const pvpTeams = usePvpTeams();

  const data = useMemo(() => {
    if (!dataset.data) return null;
    const completedLists = (lists.data ?? []).filter((l) => l.entryCount > 0 && l.doneCount === l.entryCount).length;
    const friendsCount = friends.data?.length ?? 0;
    const pvpCount = (myPvp.data?.length ?? 0) + (pvpTeams.data?.length ?? 0);
    return computeMedals(dataset.data.ds, {
      entries: membership.data ?? [],
      completedLists,
      friendsCount,
      pvpCount,
    });
  }, [dataset.data, membership.data, lists.data, friends.data, myPvp.data, pvpTeams.data]);

  if (!me.data || !data) return null;
  return <MedalsCard data={data} />;
}

function MedalGrid({ title, medals, selectedId, onSelect }: { title: string; medals: Medal[]; selectedId: MedalId; onSelect: (id: MedalId) => void }) {
  const t = useT();
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</h3>
      <ul className="grid grid-cols-3 gap-2">
        {medals.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              aria-pressed={m.id === selectedId}
              onClick={() => onSelect(m.id)}
              className={`flex w-full flex-col items-center rounded-xl border p-2 text-center transition active:scale-[0.98] ${
                m.id === selectedId ? 'border-go bg-go-soft/40' : 'border-line bg-card hover:bg-paper-2'
              }`}
            >
              <MedalEmblem medal={m} size={44} />
              <span className="mt-2 w-full truncate text-[11px] font-bold leading-tight">{t.medal_names[m.id] ?? m.id}</span>
              <span className="tnum text-[10px] font-semibold text-ink-3">
                {m.value}{m.next !== null ? ` / ${m.next}` : ' ★'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Collection statistics sheet opened from a collection's TopBar: overall %, shiny progress, Gen 1–9, categories, tags. */
export function CollectionStatsSheet({ open, onClose, idx, list }: { open: boolean; onClose: () => void; idx: DatasetIndex; list: ListDetail }) {
  const t = useT();
  const stats = useMemo(() => (open ? computeCollectionStats(idx.ds, list.entries) : null), [open, idx.ds, list.entries]);

  return (
    <Sheet open={open} onClose={onClose} title={t.stats_title}>
      {stats && (
        <div className="space-y-5">
          <div className="rounded-card bg-paper-2/60 p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="tnum text-3xl font-black text-go-ink dark:text-go">{stats.pct} %</span>
              <span className="tnum text-sm font-semibold text-ink-2">{t.progress(stats.done, stats.total)}</span>
            </div>
            <div className="mt-2">
              <Progress done={stats.done} total={stats.total} />
            </div>
            {stats.shinyTotal > 0 && (
              <div className="mt-3 border-t border-line pt-2.5">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                  <span>✨ {t.stats_shiny_progress}</span>
                  <span className="tnum text-ink-2">{stats.shinyDone} / {stats.shinyTotal} ({Math.round((stats.shinyDone / stats.shinyTotal) * 100)} %)</span>
                </div>
                <Progress done={stats.shinyDone} total={stats.shinyTotal} />
              </div>
            )}
          </div>

          {stats.byGen.length > 0 && (
            <StatBars
              title={t.stats_by_gen}
              rows={stats.byGen.map((g) => ({
                key: String(g.gen),
                label: `${t.medal_names[`gen_${g.gen}`] ?? `Gen ${g.gen}`}`,
                sub: `Gen ${g.gen}`,
                done: g.done,
                total: g.total,
              }))}
            />
          )}

          {stats.byKind.length > 1 && (
            <StatBars
              title={t.stats_by_kind}
              rows={stats.byKind.map((k) => ({
                key: k.kind,
                label: t.kinds[k.kind] ?? k.kind,
                done: k.done,
                total: k.total,
              }))}
            />
          )}

          {stats.byTag.length > 0 && (
            <StatBars
              title={t.stats_by_tag}
              rows={stats.byTag.map((tg) => ({
                key: tg.tag,
                label: tg.tag === 'background' ? t.tag_background : tagLabel(idx, tg.tag as ListDetail['entries'][number]['tag'], t),
                done: tg.done,
                total: tg.total,
              }))}
            />
          )}
        </div>
      )}
    </Sheet>
  );
}

function StatBars({ title, rows }: { title: string; rows: { key: string; label: string; sub?: string; done: number; total: number }[] }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">{title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
          return (
            <li key={r.key}>
              <div className="mb-1 flex items-baseline gap-2 text-xs">
                <span className="font-semibold text-ink">{r.label}</span>
                {r.sub && <span className="text-ink-3">{r.sub}</span>}
                <span className="tnum ml-auto font-semibold text-ink-2">{r.done} / {r.total} ({pct} %)</span>
              </div>
              <Progress done={r.done} total={r.total} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
