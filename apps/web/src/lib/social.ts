/** Friends' lists, "I have it" marks, notifications, push and the live connection. */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification, ListDetail, ListSummary, LiveEvent, NotificationType } from '@mydexpogo/shared';
import { api } from './api.js';

export const useAllFriendLists = (enabled = true) =>
  useQuery({ queryKey: ['friends-lists'], queryFn: () => api<{ lists: ListSummary[] }>('/lists/friends').then((r) => r.lists), enabled });

export interface OfferVariantInput {
  variantKey: string;
  gender: string;
  shiny: boolean;
  tag: string;
}

export function useOffer(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: OfferVariantInput & { on: boolean; deferNotify?: boolean }) => api<{ list: ListDetail }>(`/lists/${listId}/offers`, { body: b }),
    onSuccess: (r) => {
      qc.setQueryData(['list', listId], (old: { list: ListDetail; access: string } | undefined) => (old ? { ...old, list: r.list } : old));
      void qc.invalidateQueries({ queryKey: ['list', listId, 'history'] });
    },
  });
}

/** Flushes deferred "I have it" notifications when leaving a friend's list (uses keepalive so tab close succeeds too). */
export function flushOfferNotifications(listId: string, variants: OfferVariantInput[]) {
  if (!variants.length) return;
  void fetch(`/api/lists/${listId}/offers/notify`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ variants }),
  }).catch(() => {});
}

export const useNotifications = (enabled = true) =>
  useQuery({ queryKey: ['notifications'], queryFn: () => api<{ items: AppNotification[]; unread: number }>('/notifications'), enabled, refetchInterval: 5 * 60_000 });

/** Deletes one notification (or all, without an id). Gone from the page at once. */
export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) => api(`/notifications${id ? `/${id}` : ''}`, { method: 'DELETE' }),
    onMutate: (id) => {
      qc.setQueryData<{ items: AppNotification[]; unread: number }>(['notifications'], (old) => {
        if (!old) return old;
        const items = id ? old.items.filter((n) => n.id !== id) : [];
        return { items, unread: items.filter((n) => !n.readAt).length };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api('/notifications/read', { body: ids ? { ids } : {} }),
    // The bell clears at once; the server's answer (and the live event to other tabs) confirms it.
    onMutate: (ids) => {
      qc.setQueryData<{ items: AppNotification[]; unread: number }>(['notifications'], (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const items = old.items.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n));
        return { items, unread: items.filter((n) => !n.readAt).length };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export type NotifyPrefs = Record<NotificationType, boolean>;
export const useNotifyPrefs = () => useQuery({ queryKey: ['notify-prefs'], queryFn: () => api<{ prefs: NotifyPrefs }>('/notifications/prefs').then((r) => r.prefs) });
export function useSetNotifyPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<NotifyPrefs>) => api<{ prefs: NotifyPrefs }>('/notifications/prefs', { method: 'PUT', body: p }).then((r) => r.prefs),
    // Optimistic: the switch moves at once, and goes back if the server refuses.
    onMutate: (p) => {
      const before = qc.getQueryData<NotifyPrefs>(['notify-prefs']);
      if (before) qc.setQueryData(['notify-prefs'], { ...before, ...p });
      return { before };
    },
    onError: (_e, _p, ctx) => ctx?.before && qc.setQueryData(['notify-prefs'], ctx.before),
    onSuccess: (prefs) => qc.setQueryData(['notify-prefs'], prefs),
  });
}

/**
 * Keeps one live connection while logged in and refreshes exactly what changed.
 * EventSource reconnects by itself; on reconnect everything social is refetched in case events were missed.
 */
export function useRealtime(loggedIn: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!loggedIn || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/stream', { withCredentials: true });
    es.addEventListener('ready', () => {
      // A mark for tests (and dev tools): this page now gets live events.
      document.documentElement.dataset.live = 'ready';
      // Whatever happened between the page load and this connection (or during a reconnect) sent no event here:
      // re-read everything social. Only what is on screen is fetched again, the rest is just marked stale.
      for (const k of ['lists', 'friends-lists', 'friends', 'friend-requests', 'notifications', 'list', 'friend-lists', 'postcards-discover']) void qc.invalidateQueries({ queryKey: [k] });
    });
    es.addEventListener('live', (msg) => {
      const e = JSON.parse((msg as MessageEvent<string>).data) as LiveEvent;
      if (e.type === 'list') {
        void qc.invalidateQueries({ queryKey: ['list', e.listId] });
        void qc.invalidateQueries({ queryKey: ['lists'] });
        void qc.invalidateQueries({ queryKey: ['lists-membership'] });
        void qc.invalidateQueries({ queryKey: ['friends-lists'] });
        void qc.invalidateQueries({ queryKey: ['friend-lists', e.ownerId] });
        void qc.invalidateQueries({ queryKey: ['postcards-discover'] });
      } else if (e.type === 'friends') {
        for (const k of ['friends', 'friend-requests', 'friends-lists', 'friend-lists', 'postcards-discover']) void qc.invalidateQueries({ queryKey: [k] });
      } else if (e.type === 'notification') {
        void qc.invalidateQueries({ queryKey: ['notifications'] });
      } else if (e.type === 'announcement') {
        void qc.invalidateQueries({ queryKey: ['announcement'] });
      } else if (e.type === 'dataset') {
        void qc.invalidateQueries({ queryKey: ['dataset'] });
        void qc.invalidateQueries({ queryKey: ['overrides'] });
      }
    });
    return () => {
      es.close();
      delete document.documentElement.dataset.live;
    };
  }, [loggedIn, qc]);
}

/* ---------- Push ---------- */

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return 'unsupported';
  if (!('PushManager' in window)) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Must run from a tap (browsers only show the permission prompt on a user gesture). */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/push/key');
  const subscription = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await api('/push/subscribe', { body: subscription.toJSON() });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await api('/push/unsubscribe', { body: { endpoint: subscription.endpoint } }).catch(() => {});
    await subscription.unsubscribe();
  }
  return 'off';
}

/** Friends' lists are followed by default; unfollowing hides one from "Friends' lists". */
export function useFollowList(listId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => api<{ following: boolean }>(`/lists/${listId}/follow`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: () => {
      for (const k of ['list', 'friends-lists', 'friend-lists']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
