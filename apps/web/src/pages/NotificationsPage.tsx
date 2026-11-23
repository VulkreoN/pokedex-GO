import { useEffect } from 'react';
import { Link } from 'react-router';
import type { AppNotification } from '@mydexpogo/shared';
import { Button, Empty, Spinner, TopBar } from '../components/ui.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useDataset } from '../lib/dataset.js';
import { useMarkRead, useNotifications } from '../lib/social.js';

function target(n: AppNotification): string {
  if (n.type === 'raid') return '/game';
  if (n.type === 'account') return '/me';
  if ((n.type === 'offer' || n.type === 'offer_caught') && n.list) return `/lists/${n.list.id}`;
  if (n.type === 'friend_accepted' && n.actor) return `/friends/${n.actor.id}`;
  return '/friends';
}

export function NotificationsPage() {
  const t = useT();
  const { lang } = useLang();
  const q = useNotifications();
  const dataset = useDataset();
  const read = useMarkRead();
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
    if (n.type === 'account') return t.notif_account(String(n.data.change), String(n.data.role ?? ''));
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

  return (
    <>
      <TopBar title={t.notifications} back />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-2">
        {q.isPending && <Spinner />}
        {q.data?.items.length === 0 && <Empty>{t.notifications_empty}</Empty>}
        {unread > 0 && (
          <Button tone="ghost" className="mb-2 w-full" onClick={() => read.mutate(undefined)}>{t.notifications_read_all}</Button>
        )}
        <ul className="space-y-2">
          {q.data?.items.map((n) => (
            <li key={n.id}>
              <Link to={target(n)} onClick={() => { if (unread > 0) read.mutate(undefined); }} className={`card flex items-start gap-3 p-3 ${n.readAt ? '' : 'ring-2 ring-sky/60'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-sky'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{text(n)}</span>
                  <span className="tnum block text-xs text-ink-3">{when.format(new Date(n.createdAt))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
