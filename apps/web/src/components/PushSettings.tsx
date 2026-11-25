import { useEffect, useState } from 'react';
import type { NotificationType } from '@mydexpogo/shared';
import { useMe } from '../lib/auth.js';
import { useT } from '../lib/i18n.js';
import { disablePush, enablePush, pushState, useNotifyPrefs, useSetNotifyPrefs, type PushState } from '../lib/social.js';
import { Button } from './ui.js';
import { useToast } from './toast.js';

/** Account changes are not here: they always reach the player. Staff alerts only for managers and admins. */
const KINDS: Exclude<NotificationType, 'account'>[] = ['friend_request', 'friend_accepted', 'offer', 'offer_caught', 'raid', 'spawn', 'quest', 'announcement', 'admin'];

export function PushSettings() {
  const t = useT();
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const prefs = useNotifyPrefs();
  const setPrefs = useSetNotifyPrefs();
  const role = useMe().data?.role;
  const staff = role === 'manager' || role === 'admin';
  // Local copy so a switch flips on tap, before the server answers.
  const [local, setLocal] = useState<Partial<Record<NotificationType, boolean>>>({});
  useEffect(() => {
    void pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      setState(await fn());
    } catch {
      toast(t.err_generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card border border-line p-4">
      <h2 className="text-base font-bold">{t.push_title}</h2>
      {state === 'on' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-go-ink dark:text-go">{t.push_on}</span>
          <Button tone="ghost" className="min-h-9 px-3 text-sm" disabled={busy} onClick={() => run(disablePush)}>{t.push_disable}</Button>
        </div>
      )}
      {state === 'off' && <Button tone="primary" className="mt-2" disabled={busy} onClick={() => run(enablePush)}>{t.push_enable}</Button>}
      {state === 'denied' && <p className="mt-1 text-sm text-ink-2">{t.push_denied}</p>}
      {state === 'needs-install' && <p className="mt-1 text-sm text-ink-2">{t.push_needs_install}</p>}
      {state === 'unsupported' && <p className="mt-1 text-sm text-ink-2">{t.push_unsupported}</p>}

      <h3 className="mb-1 mt-4 text-sm font-semibold text-ink-2">{t.push_kinds}</h3>
      <ul className="space-y-1">
        {KINDS.filter((k) => k !== 'admin' || staff).map((k) => (
          <li key={k}>
            <label className="flex min-h-10 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-go"
                checked={local[k] ?? prefs.data?.[k] ?? true}
                disabled={!prefs.data}
                onChange={(e) => {
                  const on = e.target.checked;
                  setLocal((l) => ({ ...l, [k]: on }));
                  setPrefs.mutate({ [k]: on }, { onError: () => setLocal((l) => ({ ...l, [k]: !on })) });
                }}
              />
              <span className="text-sm">{t[`push_kind_${k}`]}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">{t.push_quiet} {t.push_account_always}</p>
    </section>
  );
}
