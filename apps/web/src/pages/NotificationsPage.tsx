import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AppNotification, EntryGender } from '@mydexpogo/shared';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { Button, Chip, Empty, HoldButton, IconButton, Spinner, TopBar } from '../components/ui.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { entryVariant, useDataset } from '../lib/dataset.js';
import { useDeleteNotification, useMarkRead, useNotifications } from '../lib/social.js';
import { useMe } from '../lib/auth.js';
import { useFriendRequests, useRespondFriendRequest } from '../lib/lists.js';

function target(n: AppNotification): string {
  if (n.type === 'raid') return '/game';
  if (n.type === 'spawn') return '/game?tab=spawns';
  if (n.type === 'quest') return '/game?tab=research';
  if (n.type === 'account') return '/me';
  if (n.type === 'admin') return n.data.kind === 'report' ? '/review' : '/admin?tab=health';
  if ((n.type === 'offer' || n.type === 'offer_caught') && n.list) return `/lists/${n.list.id}`;
  if (n.type === 'friend_accepted' && n.actor) return `/friends/${n.actor.id}`;
  return '/friends';
}

export function NotificationsPage() {
  const t = useT();
  const { lang } = useLang();
  const q = useNotifications();
  const me = useMe();
  const requests = useFriendRequests();
  const respond = useRespondFriendRequest();
  /** Requests still pending, by who sent them. */
  const pendingFrom = new Map((requests.data ?? []).filter((r) => r.to.id === me.data?.id).map((r) => [r.from.id, r.id]));
  const dataset = useDataset();
  const read = useMarkRead();
  const clear = useDeleteNotification();
  const [filter, setFilter] = useState<'all' | 'social' | 'game'>('all');
  const unread = q.data?.unread ?? 0;
  // Opening the inbox counts as seeing it; rows stay highlighted until the next visit.
  useEffect(() => {
    if (unread > 0) {
      const id = setTimeout(() => read.mutate(undefined), 1500);
      return () => clearTimeout(id);
    }
  }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = (n: AppNotification) => {
    const who = n.actor?.username ?? '?';
    if (n.type === 'friend_request') return t.notif_friend_request(who);
    if (n.type === 'friend_accepted') return t.notif_friend_accepted(who);
    if (n.type === 'raid') return t.notif_raid(raidNames(n));
    if (n.type === 'spawn' || n.type === 'quest') {
      const names = (n.data.names as string[] | undefined) ?? [];
      const first = (n.data.mons as { where: string; whereFr?: string | null; from: string | null }[] | undefined)?.[0];
      const where = (lang === 'fr' && first?.whereFr) || first?.where || '';
      if (n.data.remind) return t.notif_remind(names, (lang === 'fr' && (n.data.eventFr as string | undefined)) || String(n.data.event ?? ''), String(n.data.start ?? ''));
      return n.type === 'spawn' ? t.notif_spawn(names, where, first?.from ?? null) : t.notif_quest(names, where);
    }
    if (n.type === 'admin') return n.data.kind === 'report' ? t.notif_admin_report(String(n.data.by ?? '?'), String(n.data.variant ?? '')) : t.notif_admin_data(String(n.data.error ?? ''));
    if (n.type === 'account') return t.notif_account(String(n.data.change), String(n.data.role ?? n.data.value ?? ''));
    if (n.type === 'offer_caught') return t.notif_offer_caught(who, Number(n.data.count ?? 1), n.list?.name ?? '');
    return t.notif_offer(who, Number(n.data.count ?? 1), n.list?.name ?? '');
  };
  /** The bosses in the app language when the Pokédex is loaded, the server's French names otherwise. */
  const raidNames = (n: AppNotification): string[] => {
    const bosses = (n.data.bosses as { key: string; shadow: boolean }[] | undefined) ?? [];
    const idx = dataset.data;
    if (!idx || !bosses.length) return (n.data.names as string[] | undefined) ?? [];
    return bosses.map((b) => {
      const v = idx.variantByKey.get(b.key);
      const name = localized(idx.speciesByDex.get(Number(b.key.split('.')[0]))?.name, lang);
      return [name, v?.kind !== 'base' && v?.label ? localized(v.label, lang) : '', b.shadow ? t.tag_shadow.toLowerCase() : ''].filter(Boolean).join(' ');
    });
  };
  const when = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const isSocial = (n: AppNotification) => n.type === 'friend_request' || n.type === 'friend_accepted' || n.type === 'offer' || n.type === 'offer_caught';
  const isGame = (n: AppNotification) => n.type === 'raid' || n.type === 'spawn' || n.type === 'quest';
  const allItems = q.data?.items ?? [];
  const hasCategories = allItems.some(isSocial) && allItems.some(isGame);
  const shownItems = filter === 'all' ? allItems : allItems.filter(filter === 'social' ? isSocial : isGame);

  /** Mini-sprites extracted from offer / raid notifications when the Pokédex is loaded. */
  const spritesOf = (n: AppNotification) => {
    const idx = dataset.data;
    if (!idx) return [];
    if (n.type === 'offer' || n.type === 'offer_caught') {
      const vs = (n.data.variants as { key: string; gender?: EntryGender; shiny?: boolean }[] | undefined) ?? [];
      return vs.slice(0, 4).flatMap((x) => {
        const v = entryVariant(idx, x.key, x.gender ?? '');
        return v ? [{ v, shiny: !!x.shiny, id: `${x.key}-${x.gender ?? ''}-${x.shiny ? 1 : 0}` }] : [];
      });
    }
    if (n.type === 'raid') {
      const bs = (n.data.bosses as { key: string }[] | undefined) ?? [];
      return bs.slice(0, 4).flatMap((b) => {
        const v = idx.variantByKey.get(b.key) ?? idx.coverOf.get(Number(b.key.split('.')[0]));
        return v ? [{ v, shiny: false, id: b.key }] : [];
      });
    }
    if (n.type === 'spawn' || n.type === 'quest') {
      const ms = (n.data.mons as { key: string }[] | undefined) ?? [];
      return ms.slice(0, 4).flatMap((m) => {
        const v = idx.variantByKey.get(m.key) ?? idx.coverOf.get(Number(m.key.split('.')[0]));
        return v ? [{ v, shiny: false, id: m.key }] : [];
      });
    }
    return [];
  };

  return (
    <>
      <TopBar title={t.notifications} back />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-2">
        {q.isPending && <Spinner />}
        {q.data?.items.length === 0 && <Empty>{t.notifications_empty}</Empty>}
        {!!allItems.length && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {hasCategories && (
              <div className="mr-auto flex gap-1.5">
                {(['all', 'social', 'game'] as const).map((f) => (
                  <Chip key={f} active={filter === f} onClick={() => setFilter(f)} className="min-h-8 px-2.5 text-xs">
                    {t[`notif_filter_${f}`]}
                  </Chip>
                ))}
              </div>
            )}
            <div className="ml-auto flex gap-2">
              {unread > 0 && <Button tone="ghost" className="min-h-9 whitespace-nowrap px-3 text-sm" onClick={() => read.mutate(undefined)}>{t.notifications_read_all}</Button>}
              <HoldButton small ms={800} className="whitespace-nowrap" onConfirm={() => clear.mutate(undefined)}>{t.notifications_clear}</HoldButton>
            </div>
          </div>
        )}
        <ul className="space-y-2">
          {shownItems.map((n) => {
            const thumbs = spritesOf(n);
            return (
              <li key={n.id} className="relative">
                <Link to={target(n)} onClick={() => { if (unread > 0) read.mutate(undefined); }} className={`card flex items-start gap-3 p-3 pr-12 ${n.readAt ? '' : 'ring-2 ring-sky/60'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-sky'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{text(n)}</span>
                    {thumbs.length > 0 && dataset.data && (
                      <span className="mt-1 flex items-center gap-1">
                        {thumbs.map((th, i) => (
                          <span key={`${th.id}-${i}`} className="relative">
                            <Sprite idx={dataset.data} variant={th.v} shiny={th.shiny} size={32} />
                            {th.shiny && <Sparkle className="absolute -right-0.5 top-0 h-2.5 w-2.5 text-shiny" />}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="tnum block text-xs text-ink-3">{when.format(new Date(n.createdAt))}</span>
                  </span>
                </Link>
                {/* A friend request still waiting: answered from here. */}
                {n.type === 'friend_request' && n.actor && pendingFrom.get(n.actor.id) && (
                  <div className="mt-1.5 flex gap-2 pl-8">
                    <Button tone="primary" className="min-h-9 flex-1 text-sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: pendingFrom.get(n.actor!.id)!, action: 'accept' })}>{t.accept}</Button>
                    <Button tone="ghost" className="min-h-9 flex-1 text-sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: pendingFrom.get(n.actor!.id)!, action: 'decline' })}>{t.decline}</Button>
                  </div>
                )}
                <IconButton label={t.notification_delete} className="absolute right-1 top-1.5 h-9 w-9" onClick={() => clear.mutate(n.id)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </IconButton>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
