import { GenderReview } from '../components/GenderReview.js';
import { Reports } from './AdminPage.js';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { neutralKey } from '@mydexpogo/shared';
import { Sprite } from '../components/Sprite.js';
import { useToast } from '../components/toast.js';
import { Badge, Button, Chip, Empty, Spinner, TopBar } from '../components/ui.js';
import { api } from '../lib/api.js';
import { useBulkOverride, useOverrides, type Override } from '../lib/admin.js';
import { useMe } from '../lib/auth.js';
import { useDataset, type DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';

interface FeedItem {
  id: string;
  source: string;
  title: string | null;
  content: string;
  url: string | null;
  attachments: { name: string; file: string | null; contentType: string | null; size: number; text?: string }[];
  matches: { variantKey: string; reason: string }[];
  status: 'new' | 'done' | 'ignored';
  auto: boolean;
  postedAt: string;
}
interface FeedStatus { enabled: { news: string[] }; lastRunAt: string | null; lastError: string | null; running: boolean; pending: number }

type Status = 'new' | 'done' | 'ignored';

export function ReviewPage() {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const dataset = useDataset();
  const [status, setStatus] = useState<Status>('new');
  const q = useQuery({ queryKey: ['feed', status], queryFn: () => api<{ items: FeedItem[]; status: FeedStatus }>(`/feed?status=${status}`) });
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});
  const act = useMutation({
    mutationFn: (vars: { id: string; action: 'apply' | 'ignore' | 'reopen'; variantKeys?: string[] }) =>
      api<{ ok: true }>(`/feed/${encodeURIComponent(vars.id)}/${vars.action}`, { method: 'POST', body: vars.action === 'apply' ? { variantKeys: vars.variantKeys ?? [] } : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['dataset'] });
      qc.invalidateQueries({ queryKey: ['data-status'] });
    },
  });
  const poll = useMutation({ mutationFn: () => api<{ status: FeedStatus }>('/feed/poll', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }) });
  const idx = dataset.data;
  const isAdmin = me.data?.role === 'admin';

  const pickedFor = (item: FeedItem) => picked[item.id] ?? new Set(item.matches.map((m) => m.variantKey));
  const toggle = (item: FeedItem, key: string) =>
    setPicked((p) => {
      const cur = new Set(pickedFor(item));
      cur.has(key) ? cur.delete(key) : cur.add(key);
      return { ...p, [item.id]: cur };
    });

  const sourceLabel = (s: string) => (s.startsWith('news') ? t.src_news : s);

  return (
    <>
      <TopBar title={t.review_title} back>
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-5">
          {(['new', 'done', 'ignored'] as Status[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{{ new: t.review_new, done: t.review_done, ignored: t.review_ignored }[s]}</Chip>
          ))}
        </div>
      </TopBar>
      <main className="mx-auto max-w-6xl space-y-3 px-3 pb-24 sm:px-5">
        {status === 'new' && (
          <details open className="card p-3">
            <summary className="cursor-pointer text-sm font-bold">{t.admin_tabs.reports}</summary>
            <div className="mt-2.5">
              <Reports />
            </div>
          </details>
        )}
        {status === 'new' && idx && <GenderReview idx={idx} />}
        {status === 'new' && idx && <HiddenVariantsCard idx={idx} />}
        {q.data && (
          <p className="text-xs text-ink-3">
            {q.data.status.enabled.news.length === 0 ? t.feed_disabled : t.feed_sources(q.data.status.enabled.news.length)}
            {q.data.status.lastError && <span className="block text-berry">{q.data.status.lastError}</span>}
            {isAdmin && <button type="button" className="ml-2 font-semibold text-sky" disabled={poll.isPending} onClick={() => poll.mutate()}>{t.feed_poll_now}</button>}
          </p>
        )}
        {q.isPending && <Spinner />}
        {q.data?.items.length === 0 && <Empty>{t.nothing_here}</Empty>}
        {q.data?.items.map((item) => {
          const image = item.attachments.find((a) => a.contentType?.startsWith('image/'));
          const imageUrl = image?.text ?? null;
          const sel = pickedFor(item);
          return (
            <article key={item.id} className="card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <Badge tone="grass">{sourceLabel(item.source)}</Badge>
                <span>{new Date(item.postedAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {item.auto && <Badge tone="muted">{t.review_auto}</Badge>}
                {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-sky">{t.review_open}</a>}
              </div>
              {item.title && <h2 className="mt-1 text-[17px] font-bold leading-tight">{item.title}</h2>}
              {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="mt-2 max-h-56 w-full rounded-xl object-cover" />}
              <Excerpt text={item.content} />
              {item.attachments.filter((a) => a.text && !a.contentType?.startsWith('image/')).map((a) => (
                <details key={a.name} className="mt-2 rounded-lg bg-paper-2 p-2 text-xs">
                  <summary className="cursor-pointer font-semibold">{a.name} · {Math.round(a.size / 1024)} {lang === 'fr' ? 'Ko' : 'KB'}</summary>
                  <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all">{a.text!.slice(0, 20000)}</pre>
                </details>
              ))}
              {item.matches.length > 0 && idx && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-ink-3">{t.review_candidates}</p>
                  <ul className="flex flex-wrap gap-2">
                    {item.matches.map((m) => {
                      const v = idx.variantByKey.get(m.variantKey);
                      const sp = v && idx.speciesByDex.get(v.dex);
                      const on = sel.has(m.variantKey);
                      return (
                        <li key={m.variantKey} className="flex items-stretch gap-1">
                          <button
                            type="button"
                            disabled={item.status !== 'new'}
                            onClick={() => toggle(item, m.variantKey)}
                            title={m.reason}
                            className={`flex items-center gap-2 rounded-xl border-2 px-2 py-1 text-left text-xs ${on ? 'border-go bg-go-soft' : 'border-line'}`}
                          >
                            {v && <Sprite idx={idx} variant={v} size={36} />}
                            <span>
                              <span className="block font-semibold">{sp ? localized(sp.name, lang) : m.variantKey}{v?.gender ? (v.gender === 'f' ? ' ♀' : ' ♂') : ''}</span>
                              <span className="block text-ink-2">{v ? localized(v.label, lang) || t.normal : m.variantKey}{v?.datamined ? '' : ` · ${t.mark_released}`}</span>
                            </span>
                          </button>
                          {v && (
                            <Link
                              to={`/dex/${v.dex}`}
                              className="inline-flex items-center rounded-xl border border-line bg-paper/60 px-2 text-[11px] font-semibold text-sky hover:bg-paper-2"
                              title={t.review_open_dex}
                            >
                              {t.review_open_dex} ›
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                {item.status === 'new' ? (
                  <>
                    <Button tone="primary" className="min-h-10 flex-1 text-sm" disabled={sel.size === 0 || act.isPending} onClick={async () => { await act.mutateAsync({ id: item.id, action: 'apply', variantKeys: [...sel] }); toast(t.saved); }}>
                      {t.review_mark_released(sel.size)}
                    </Button>
                    <Button tone="ghost" className="min-h-10 text-sm" disabled={act.isPending} onClick={() => act.mutate({ id: item.id, action: 'ignore' })}>{t.review_ignore}</Button>
                  </>
                ) : (
                  <Button tone="ghost" className="min-h-10 text-sm" disabled={act.isPending} onClick={() => act.mutate({ id: item.id, action: 'reopen' })}>{t.review_reopen}</Button>
                )}
              </div>
            </article>
          );
        })}
        <p className="pt-4 text-center text-xs text-ink-3"><Link to="/me" className="underline">{t.nav_me}</Link></p>
      </main>
    </>
  );
}

function HiddenVariantsCard({ idx }: { idx: DatasetIndex }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const overrides = useOverrides(true);
  const bulk = useBulkOverride();
  const hiddenGroups = useMemo(() => {
    const grouped = new Map<string, { keys: string[]; sample: Override }>();
    for (const o of overrides.data ?? []) {
      if (o.hidden !== true) continue;
      const nk = neutralKey(o.variantKey);
      const cur = grouped.get(nk);
      if (cur) cur.keys.push(o.variantKey);
      else grouped.set(nk, { keys: [o.variantKey], sample: o });
    }
    return [...grouped.entries()].map(([key, v]) => ({ key, ...v }));
  }, [overrides.data]);
  if (!hiddenGroups.length) return null;
  return (
    <details className="card border-berry/35 p-3">
      <summary className="cursor-pointer text-sm font-bold text-berry">
        {t.variant_hidden_title(hiddenGroups.length)}
      </summary>
      <ul className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {hiddenGroups.map(({ key, keys, sample }) => {
          const dex = sample.meta?.dex ?? Number(key.split('.')[0]);
          const sp = idx.speciesByDex.get(dex);
          const img = sample.meta?.img;
          const src = img ? (/^https?:\/\//.test(img) ? img : `${idx.ds.assetBase}${img}`) : null;
          const label = localized(sample.label ?? sample.meta?.label, lang) || t.normal;
          return (
            <li key={key} className="flex items-center gap-2.5 rounded-xl border border-line bg-paper/60 p-2">
              {src && <img src={src} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 object-contain opacity-75" />}
              <div className="min-w-0 flex-1">
                <Link to={`/dex/${dex}`} className="block truncate text-sm font-bold text-sky hover:underline">
                  {sp ? localized(sp.name, lang) : `#${dex}`} · {label}
                </Link>
                <p className="truncate font-mono text-[11px] text-ink-3">{key}</p>
              </div>
              <Button
                tone="quiet"
                className="min-h-8 shrink-0 px-2.5 text-xs"
                disabled={bulk.isPending}
                onClick={async () => {
                  await bulk.mutateAsync({ keys, hidden: null });
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
  );
}

function Excerpt({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const short = text.length > 320 && !open;
  return (
    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">
      {short ? text.slice(0, 320) + '…' : text}
      {text.length > 320 && <button type="button" className="ml-1 font-semibold text-sky" onClick={() => setOpen((o) => !o)}>{open ? '−' : '+'}</button>}
    </p>
  );
}
