/**
 * Notifications: one inbox row per event, live refresh of open tabs, and a push to the user's devices.
 * Anti-spam: repeated events of the same kind from the same friend on the same list within a window are merged
 * into the unread row (no new push), each kind can be switched off, and pushes are capped per user per day.
 */
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { NotificationType } from '@mydexpogo/shared';
import { db, schema } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { hub } from './hub.js';
import { pushToUser, type PushMessage } from './push.js';

export const MERGE_WINDOW_MS = 60 * 60_000;
export const DAILY_PUSH_CAP = 15;
const pushesToday = new Map<string, { day: string; n: number }>();

function underCap(userId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const c = pushesToday.get(userId);
  if (!c || c.day !== day) {
    pushesToday.set(userId, { day, n: 1 });
    return true;
  }
  if (c.n >= DAILY_PUSH_CAP) return false;
  c.n++;
  return true;
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** The friend behind it; null for what the app itself announces (raids). */
  actorId: string | null;
  listId?: string | null;
  data?: Record<string, unknown>;
  /** Merges into an unread row of the same kind/actor/list instead of adding one. */
  merge?: (previous: Record<string, unknown>) => Record<string, unknown>;
  push: (data: Record<string, unknown>) => PushMessage;
}

export async function notify(n: NotifyInput): Promise<void> {
  if (n.userId === n.actorId) return;
  const since = new Date(Date.now() - MERGE_WINDOW_MS);
  const [prev] = n.merge
    ? await db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, n.userId),
            eq(schema.notifications.type, n.type),
            n.actorId ? eq(schema.notifications.actorId, n.actorId) : isNull(schema.notifications.actorId),
            n.listId ? eq(schema.notifications.listId, n.listId) : isNull(schema.notifications.listId),
            isNull(schema.notifications.readAt),
            gt(schema.notifications.createdAt, since),
          ),
        )
        .orderBy(desc(schema.notifications.createdAt))
        .limit(1)
    : [];
  if (prev && n.merge) {
    await db.update(schema.notifications).set({ data: n.merge(prev.data) }).where(eq(schema.notifications.id, prev.id));
    hub.emit([n.userId], { type: 'notification' });
    return; // already pushed for this burst
  }
  const data = n.data ?? {};
  await db.insert(schema.notifications).values({ id: newId(), userId: n.userId, type: n.type, actorId: n.actorId, listId: n.listId ?? null, data });
  hub.emit([n.userId], { type: 'notification' });

  const [user] = await db.select({ prefs: schema.users.notifyPrefs }).from(schema.users).where(eq(schema.users.id, n.userId)).limit(1);
  // What happens to your own account always reaches you, whatever the switches and the daily cap.
  if (n.type !== 'account') {
    if (user?.prefs[n.type] === false) return;
    if (!underCap(n.userId)) return;
  }
  await pushToUser(n.userId, n.push(data)).catch((e) => console.error('push', e));
}

/** Keeps the inbox small: read notifications older than 60 days go away. */
export async function pruneNotifications() {
  await db.delete(schema.notifications).where(sql`${schema.notifications.readAt} is not null and ${schema.notifications.createdAt} < now() - interval '60 days'`);
}

export type AccountChange = 'role' | 'reset_code' | 'logout_all' | 'unsuspended' | 'renamed' | 'friend_code' | 'list_renamed' | 'list_deleted' | 'list_restored' | 'message' | 'restored';
const ROLE_FR = { user: 'dresseur', manager: 'gérant', admin: 'admin' } as const;

/** Tells a player what an admin did to their account: in the inbox and as a push, never switched off. */
export async function notifyAccount(userId: string, adminId: string, change: AccountChange, data: Record<string, unknown> = {}) {
  const role = data.role as keyof typeof ROLE_FR | undefined;
  const body =
    change === 'role' ? `Ton compte est maintenant ${role ? ROLE_FR[role] : data.role}.` :
    change === 'reset_code' ? 'Un admin a créé un code pour réinitialiser ton mot de passe. Si tu ne l’as pas demandé, préviens-le.' :
    change === 'logout_all' ? 'Un admin a fermé toutes tes sessions : reconnecte-toi.' :
    change === 'renamed' ? `Un admin a changé ton pseudo : c’est maintenant ${data.value}. Connecte-toi avec ce pseudo.` :
    change === 'friend_code' ? `Un admin a changé ton code ami : ${data.value}.` :
    change === 'list_renamed' ? `Un admin a renommé ta collection en « ${data.value} ».` :
    change === 'list_deleted' ? `Un admin a supprimé ta collection « ${data.value} ».` :
    change === 'list_restored' ? `Un admin a restauré ta collection « ${data.value} ».` :
    change === 'message' ? String(data.value) :
    change === 'restored' ? 'Un admin a restauré ton compte, avec tes collections et tes amis.' :
    'Ton compte est de nouveau actif.';
  await notify({ userId, type: 'account', actorId: adminId === userId ? null : adminId, data: { change, ...data }, push: () => ({ title: 'Ton compte MyDexPoGo', body, url: '/me', tag: `account-${change}` }) });
}

export type StaffAlert = { kind: 'report'; variant: string; reportKind: string; by: string } | { kind: 'data_error'; error: string };

/**
 * Tells the staff something needs them: a player's report reaches managers and admins, a failed data update the
 * admins. Pushed unless they switched "admin" alerts off.
 */
export async function notifyStaff(alert: StaffAlert, exceptUserId?: string) {
  const roles = alert.kind === 'report' ? ['manager', 'admin'] : ['admin'];
  const staff = await db.select({ id: schema.users.id }).from(schema.users).where(and(inArray(schema.users.role, roles as ('manager' | 'admin')[]), isNull(schema.users.suspendedAt)));
  const body = alert.kind === 'report' ? `${alert.by} a signalé une erreur sur ${alert.variant}.` : `La mise à jour des données a échoué : ${alert.error.slice(0, 120)}`;
  const url = alert.kind === 'report' ? '/review' : '/admin?tab=health';
  for (const s of staff) {
    if (s.id === exceptUserId) continue;
    await notify({ userId: s.id, type: 'admin', actorId: null, data: alert, push: () => ({ title: 'MyDexPoGo · admin', body, url, tag: `admin-${alert.kind}` }) }).catch((e) => console.error('staff alert', e));
  }
}
