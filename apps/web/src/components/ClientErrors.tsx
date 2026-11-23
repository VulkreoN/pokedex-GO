import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { relativeTime } from '../lib/admin.js';
import { useLang, useT } from '../lib/i18n.js';
import { Button } from './ui.js';

interface ClientError { id: string; message: string; stack: string | null; url: string | null; userAgent: string | null; appVersion: string | null; count: number; firstSeen: string; lastSeen: string }

/** "Safari 18 on iPhone": enough to know where a bug shows up. */
function device(ua: string | null): string {
  if (!ua) return '';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' · ');
}

/** Admins: JavaScript errors players' browsers ran into, grouped, newest first. */
export function ClientErrors() {
  const t = useT();
  const { lang } = useLang();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['client-errors'], queryFn: () => api<{ errors: ClientError[] }>('/client-errors').then((r) => r.errors) });
  const clear = useMutation({ mutationFn: () => api('/client-errors', { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['client-errors'] }) });
  return (
    <section className="card p-4">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="flex-1 text-base font-bold">{t.client_errors_title}</h2>
        {!!q.data?.length && <Button tone="ghost" className="min-h-8 px-2 text-xs" disabled={clear.isPending} onClick={() => clear.mutate()}>{t.client_errors_clear}</Button>}
      </div>
      <p className="mb-2 text-xs text-ink-3">{t.client_errors_hint}</p>
      {q.data?.length === 0 && <p className="text-sm text-ink-2">{t.client_errors_none}</p>}
      <ul className="divide-y divide-line">
        {q.data?.map((e) => (
          <li key={e.id} className="py-2">
            <details>
              <summary className="cursor-pointer list-none">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold">{e.message}</span>
                  <span className="tnum shrink-0 rounded-md bg-berry/10 px-1.5 text-xs font-bold text-berry">×{e.count}</span>
                </div>
                <div className="tnum mt-0.5 text-xs text-ink-3">
                  {[relativeTime(e.lastSeen, lang), e.url, device(e.userAgent), e.appVersion?.slice(0, 7)].filter(Boolean).join(' · ')}
                </div>
              </summary>
              {e.stack && <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-paper-2 p-2 text-[11px] leading-snug">{e.stack}</pre>}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
