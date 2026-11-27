import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ListDetail, ListEvent } from '@mydexpogo/shared';
import { relativeTime } from '../lib/admin.js';
import { api } from '../lib/api.js';
import { entryVariant, type DatasetIndex } from '../lib/dataset.js';
import { useLang, useT } from '../lib/i18n.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Badge, Button, Spinner } from './ui.js';

const ICONS: Record<ListEvent['kind'], string> = { created: '✨', added: '＋', removed: '－', caught: '✓', uncaught: '↺', renamed: '✎', visibility: '👁', offer: '🤝' };

/** The latest actions in a collection, newest first. Owners can undo reversible actions directly from here. */
export function ListHistory({ idx, listId, me, owner = false }: { idx: DatasetIndex; listId: string; me?: string; owner?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['list', listId, 'history'],
    queryFn: ({ pageParam }) => api<{ events: ListEvent[] }>(`/lists/${listId}/history${pageParam ? `?before=${pageParam}` : ''}`).then((r) => r.events),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === 30 ? last[last.length - 1]!.id : undefined),
  });
  const undo = useMutation({
    mutationFn: (eventId: number) => api<{ ok: true; list: ListDetail }>(`/lists/${listId}/history/${eventId}/undo`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['list', listId] });
      void qc.invalidateQueries({ queryKey: ['lists'] });
      void qc.invalidateQueries({ queryKey: ['lists-membership'] });
      void qc.invalidateQueries({ queryKey: ['postcards-discover'] });
      toast(t.history_undone);
    },
    onError: () => toast(t.err_generic),
  });
  if (q.isPending) return <Spinner />;
  const events = q.data?.pages.flat() ?? [];
  if (!events.length) return <p className="py-6 text-center text-sm text-ink-3">{t.history_empty}</p>;
  return (
    <div>
      <ol className="space-y-1">
        {events.map((e) => {
          const undone = !!e.undoneAt;
          const canUndo = owner && e.undoable && !undone;
          return (
            <li key={e.id} className="flex items-start gap-3 rounded-xl px-1 py-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-2 text-sm font-bold ${undone ? 'text-ink-3 opacity-60' : 'text-ink-2'}`} aria-hidden="true">{ICONS[e.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${undone ? 'text-ink-3 line-through' : ''}`}>{t.history_line(e, !!me && e.actorName === me)}</p>
                {e.items.length > 0 && (
                  <div className={`mt-1 flex flex-wrap items-center gap-0.5 ${undone ? 'opacity-50' : ''}`}>
                    {e.items.slice(0, 8).map((it, k) => {
                      const v = entryVariant(idx, it.variantKey, it.gender === 'f' ? 'f' : 'm');
                      return v ? (
                        <span key={k} className="relative">
                          <Sprite idx={idx} variant={v} shiny={it.shiny} size={32} />
                          {it.shiny && <Sparkle className="absolute -right-0.5 top-0 h-2.5 w-2.5 text-shiny" />}
                        </span>
                      ) : null;
                    })}
                    {e.count > Math.min(e.items.length, 8) && <span className="text-xs font-semibold text-ink-3">+{e.count - Math.min(e.items.length, 8)}</span>}
                  </div>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                  <span>{relativeTime(e.at, lang)}</span>
                  {undone && <Badge tone="muted">{t.history_undone_badge}</Badge>}
                </div>
              </div>
              {canUndo && (
                <Button
                  tone="ghost"
                  className="min-h-8 shrink-0 px-2.5 text-xs text-sky"
                  disabled={undo.isPending}
                  onClick={() => undo.mutate(e.id)}
                >
                  {t.undo}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {q.hasNextPage && <Button tone="ghost" className="mt-2 w-full" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{t.history_more}</Button>}
    </div>
  );
}
