import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { Role } from '@mydexpogo/shared';
import { ClientErrors } from '../components/ClientErrors.js';
import { useToast } from '../components/toast.js';
import { Badge, Button, Chip, CopyButton, Empty, Sheet, Spinner, TextField, TopBar } from '../components/ui.js';
import { api } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import {
  relativeTime,
  useAdminAction,
  useAdminAnnouncements,
  useAdminHealth,
  useAdminStats,
  useAdminUser,
  useAdminUserLists,
  useAdminUserTrash,
  useAudit,
  useReports,
  useSignups,
  useUsers,
  type AuditEntry,
  type AuditKind,
  type Report,
  type SignupSettings,
} from '../lib/admin.js';
import { useDataset } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { errorMessage, fmtCode } from './FriendsPage.js';

const TABS = ['dashboard', 'health', 'users', 'signups', 'audit', 'reports', 'announcements', 'errors'] as const;
type Tab = (typeof TABS)[number];

/** Admins only: the instance at a glance, accounts, sign-ups, journal, reports, announcements, errors. */
export function AdminPage() {
  const t = useT();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x === params.get('tab')) ?? 'dashboard';
  if (me.isPending) return <Spinner />;
  if (me.data?.role !== 'admin') return <Navigate to="/me" replace />;
  return (
    <>
      <TopBar title={t.admin_panel} back>
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-3 pb-2 [mask-image:linear-gradient(to_right,#000_88%,transparent)] [scrollbar-width:none]" role="tablist">
          {TABS.map((id) => (
            <Chip key={id} role="tab" aria-selected={tab === id} active={tab === id} ref={(el) => { if (el && tab === id) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }} onClick={() => setParams(id === 'dashboard' ? {} : { tab: id }, { replace: true })}>
              {t.admin_tabs[id]}
            </Chip>
          ))}
        </div>
      </TopBar>
      <main className="mx-auto max-w-3xl space-y-4 px-3 pb-24 pt-3">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'health' && <Health />}
        {tab === 'users' && <Users />}
        {tab === 'signups' && <Signups />}
        {tab === 'audit' && <Journal />}
        {tab === 'reports' && <Reports />}
        {tab === 'announcements' && <Announcements />}
        {tab === 'errors' && <ClientErrors />}
      </main>
    </>
  );
}

function Tile({ label, value, sub, to }: { label: string; value: number | string; sub?: string; to?: string }) {
  const body = (
    <>
      <div className="tnum text-2xl font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-xs text-ink-2">{label}</div>
      {sub && <div className="tnum text-[11px] text-ink-3">{sub}</div>}
    </>
  );
  return to ? <Link to={to} className="card block p-3 hover:brightness-[0.98]">{body}</Link> : <div className="card p-3">{body}</div>;
}

function Dashboard() {
  const t = useT();
  const { lang } = useLang();
  const q = useAdminStats();
  if (q.isPending) return <Spinner />;
  const s = q.data;
  if (!s) return <Empty>{t.err_generic}</Empty>;
  const max = Math.max(1, ...s.signupsByWeek.map((w) => w.n));
  const n = (x: number) => x.toLocaleString(lang);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label={t.admin_stat_users} value={n(s.users)} sub={t.admin_stat_active(s.active7, s.active30)} to="/admin?tab=users" />
        <Tile label={t.admin_stat_lists} value={n(s.lists)} sub={t.admin_stat_entries(n(s.entries))} />
        <Tile label={t.admin_stat_friendships} value={n(s.friendships)} />
        <Tile label={t.admin_stat_push} value={n(s.pushDevices)} sub={t.admin_stat_raids(s.raidAlerts7)} />
        <Tile label={t.admin_stat_reports} value={n(s.openReports)} to="/admin?tab=reports" />
        <Tile label={t.admin_stat_errors} value={n(s.errorsToday)} to="/admin?tab=errors" />
      </div>
      <section className="card p-3">
        <h2 className="text-sm font-bold">{t.admin_signups_chart}</h2>
        <div className="mt-3 flex h-28 items-end gap-1.5" role="img" aria-label={s.signupsByWeek.map((w) => `${w.week}: ${w.n}`).join(', ')}>
          {s.signupsByWeek.map((w) => (
            <div key={w.week} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="tnum text-[10px] text-ink-2">{w.n || ''}</span>
              <div className="w-full rounded-t-md bg-go" style={{ height: `${Math.max(2, (w.n / max) * 80)}px` }} />
              <span className="tnum text-[9px] text-ink-3">{new Date(w.week).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Health() {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const q = useAdminHealth();
  const refresh = useAdminAction((source: string) => api(`/admin/health/${source}/refresh`, { method: 'POST' }));
  if (q.isPending) return <Spinner />;
  const h = q.data;
  if (!h) return <Empty>{t.err_generic}</Empty>;
  const rows: { id: string; label: string; ok: string | null; errAt: string | null; err: string | null }[] = [
    { id: 'dataset', label: t.admin_source.dataset, ok: h.dataset.lastError ? null : h.dataset.generatedAt, errAt: h.dataset.lastError ? h.dataset.lastAttemptAt : null, err: h.dataset.lastError },
    ...(['research', 'promo', 'pvpoke', 'raids', 'feed'] as const).map((id) => ({ id, label: t.admin_source[id], ok: h.sources[id]?.okAt ?? null, errAt: h.sources[id]?.errorAt ?? null, err: h.sources[id]?.error ?? null })),
  ];
  return (
    <>
      <section className="card p-3 text-sm">
        <div className="flex justify-between gap-2"><span className="text-ink-2">{t.admin_version}</span><span className="tnum font-semibold">{h.version.slice(0, 7)}</span></div>
        <div className="mt-1 flex justify-between gap-2"><span className="text-ink-2">{t.admin_started}</span><span className="tnum font-semibold">{relativeTime(h.startedAt, lang)}</span></div>
        <div className="mt-1 flex justify-between gap-2"><span className="text-ink-2">{t.data_next}</span><span className="tnum font-semibold">{h.dataset.running ? t.data_running : relativeTime(h.dataset.nextRunAt, lang)}</span></div>
      </section>
      <ul className="space-y-2">
        {rows.map((r) => {
          const failing = !!r.errAt && (!r.ok || r.errAt > r.ok);
          return (
            <li key={r.id} className="card p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${failing ? 'bg-berry' : r.ok ? 'bg-go' : 'bg-line'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 font-semibold">{r.label}</span>
                {r.id !== 'feed' && (
                  <Button tone="ghost" className="min-h-8 px-2 text-xs" disabled={refresh.isPending} onClick={async () => { try { await refresh.mutateAsync(r.id); toast(t.admin_refreshed); } catch { toast(t.err_generic); } }}>
                    {t.admin_refresh}
                  </Button>
                )}
              </div>
              <p className="tnum mt-1 text-xs text-ink-3">{failing ? t.admin_failing(relativeTime(r.errAt, lang)) : r.ok ? t.admin_ok(relativeTime(r.ok, lang)) : t.admin_not_yet}</p>
              {failing && r.err && <p className="mt-1 break-words rounded-lg bg-berry/10 p-2 text-xs text-berry">{r.err}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Users() {
  const t = useT();
  const { lang } = useLang();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const users = useUsers(q, offset, true);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      <TextField placeholder={t.admin_search} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
      <p className="tnum mt-2 text-xs text-ink-3">{t.admin_count(users.data?.total ?? 0)}</p>
      <ul className="mt-1 divide-y divide-line">
        {users.data?.users.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => setOpen(u.id)} className="flex w-full items-baseline gap-2 py-3 text-left">
              <span className="min-w-0 flex-1 truncate font-semibold">{u.username}</span>
              {u.role !== 'user' && <Badge tone="grass">{t[`role_${u.role}`]}</Badge>}
              <span className="tnum shrink-0 text-xs text-ink-3">{new Date(u.createdAt).toLocaleDateString(lang)}</span>
            </button>
          </li>
        ))}
      </ul>
      {users.data && users.data.total > 50 && (
        <div className="mt-2 flex items-center justify-between text-sm">
          <Button tone="ghost" className="min-h-9" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>‹</Button>
          <span className="tnum text-ink-3">{offset + 1}–{Math.min(offset + 50, users.data.total)}</span>
          <Button tone="ghost" className="min-h-9" disabled={offset + 50 >= users.data.total} onClick={() => setOffset(offset + 50)}>›</Button>
        </div>
      )}
      <UserSheet id={open} onClose={() => setOpen(null)} />
    </section>
  );
}

/** One account: what it has, when it was last seen, and what an admin can do to it. */
function UserSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const me = useMe();
  const q = useAdminUser(id);
  const [issued, setIssued] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const act = useAdminAction(async (v: { path: string; method?: string; body?: unknown }) => api(v.path, { method: v.method ?? 'POST', body: v.body }));
  const u = q.data?.user;
  const self = u?.id === me.data?.id;
  const close = () => { setIssued(null); setConfirmDelete(false); setSuspending(false); setReason(''); onClose(); };
  const suspend = async (on: boolean) => {
    await act.mutateAsync({ path: `/admin/users/${u!.id}/suspend`, body: { suspended: on, reason: on ? reason.trim() || undefined : undefined } });
    setSuspending(false);
    setReason('');
    toast(on ? t.admin_suspended_done : t.admin_unsuspended_done);
  };
  return (
    <Sheet open={!!id} onClose={close} title={u?.username ?? ''}>
      {!q.data ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-sm">
          {u!.suspendedAt && (
            <div className="rounded-lg bg-paper-2 p-2">
              <Badge tone="muted">{t.admin_suspended}</Badge>
              <p className="mt-1 text-xs text-ink-2">{t.admin_suspended_by(u!.suspendedBy ?? '?', relativeTime(u!.suspendedAt, lang))}</p>
              {u!.suspendReason && <p className="mt-0.5 text-sm">« {u!.suspendReason} »</p>}
            </div>
          )}
          <AccountEdit key={u!.id} id={u!.id} username={u!.username} friendCode={u!.friendCode} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-ink-3">{t.admin_created}</dt><dd className="tnum text-right">{new Date(u!.createdAt).toLocaleDateString(lang)}</dd>
            <dt className="text-ink-3">{t.admin_last_seen}</dt><dd className="tnum text-right">{u!.lastSeenAt ? relativeTime(u!.lastSeenAt, lang) : '—'}</dd>
            <dt className="text-ink-3">{t.admin_counts_lists}</dt><dd className="tnum text-right">{q.data.counts.lists} · {q.data.counts.entries} {t.admin_entries}</dd>
            <dt className="text-ink-3">{t.friends}</dt><dd className="tnum text-right">{q.data.counts.friends}</dd>
            <dt className="text-ink-3">{t.admin_sessions}</dt><dd className="tnum text-right">{q.data.counts.sessions}</dd>
            <dt className="text-ink-3">{t.admin_devices}</dt><dd className="tnum text-right">{q.data.counts.devices}</dd>
            <dt className="text-ink-3">{t.pvp_mine_title}</dt><dd className="tnum text-right">{q.data.counts.pvp}</dd>
          </dl>

          <div>
            <p className="mb-1 text-xs font-medium text-ink-3">{t.admin_role}</p>
            <div className="flex flex-wrap gap-1.5">
              {(['user', 'manager', 'admin'] as Role[]).map((r) => (
                <Chip key={r} active={u!.role === r} disabled={self || act.isPending} className="min-h-8 px-2.5 text-xs" onClick={() => act.mutate({ path: `/users/${u!.id}/role`, method: 'PATCH', body: { role: r } })}>{t[`role_${r}`]}</Chip>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-3">{t.admin_notified}</p>
          </div>

          {issued && (
            <div className="rounded-lg bg-go-soft p-2 text-go-ink">
              <p className="text-xs">{t.admin_code_once}</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="tnum flex-1 text-base font-bold">{issued}</code>
                <CopyButton className="min-h-8 px-3 text-xs" text={issued} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button className="text-sm" onClick={async () => { const r = (await act.mutateAsync({ path: `/users/${u!.id}/reset-code` })) as { code: string }; setIssued(r.code); }}>{t.issue_reset}</Button>
            <Button className="text-sm" disabled={!q.data.counts.sessions} onClick={async () => { await act.mutateAsync({ path: `/admin/users/${u!.id}/logout` }); toast(t.admin_logged_out); }}>{t.admin_logout_all}</Button>
            {!self && (
              <Button tone={u!.suspendedAt ? 'quiet' : 'danger'} className="text-sm" disabled={act.isPending} onClick={() => (u!.suspendedAt ? void suspend(false) : setSuspending((v) => !v))}>
                {u!.suspendedAt ? t.admin_unsuspend : t.admin_suspend}
              </Button>
            )}
            {!self && u!.role !== 'admin' && (
              confirmDelete ? (
                <Button tone="danger" className="text-sm" onClick={async () => { await act.mutateAsync({ path: `/admin/users/${u!.id}`, method: 'DELETE' }); toast(t.admin_deleted); close(); }}>{t.admin_delete_confirm}</Button>
              ) : (
                <Button tone="danger" className="text-sm" onClick={() => setConfirmDelete(true)}>{t.delete}</Button>
              )
            )}
          </div>
          {suspending && !u!.suspendedAt && (
            <div className="space-y-2 rounded-lg border border-line p-2">
              <TextField label={t.admin_suspend_reason} placeholder={t.admin_suspend_reason_hint} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              <Button tone="danger" className="w-full text-sm" disabled={act.isPending} onClick={() => void suspend(true)}>{t.admin_suspend_confirm}</Button>
            </div>
          )}
          <UserLists id={u!.id} />
          <UserTrash id={u!.id} />
        </div>
      )}
    </Sheet>
  );
}

/** The account's name and friend code, each changed in place; the player is told. */
function AccountEdit({ id, username, friendCode }: { id: string; username: string; friendCode: string }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(username);
  const [code, setCode] = useState(fmtCode(friendCode));
  const [error, setError] = useState<string | null>(null);
  const act = useAdminAction((body: { username?: string; friendCode?: string }) => api(`/admin/users/${id}`, { method: 'PATCH', body }));
  const save = async (body: { username?: string; friendCode?: string }, done: string) => {
    setError(null);
    try {
      await act.mutateAsync(body);
      toast(done);
    } catch (e) {
      setError(errorMessage(t, e));
    }
  };
  const codeDigits = code.replace(/\D/g, '');
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <TextField className="flex-1" label={t.admin_username} value={name} maxLength={20} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        <Button className="min-h-11 text-sm" disabled={act.isPending || !name.trim() || name.trim() === username} onClick={() => void save({ username: name.trim() }, t.admin_renamed)}>{t.admin_rename}</Button>
      </div>
      <div className="flex items-end gap-2">
        <TextField className="flex-1" label={t.admin_friend_code} inputMode="numeric" value={code} autoComplete="off" onChange={(e) => setCode(e.target.value)} />
        <Button className="min-h-11 text-sm" disabled={act.isPending || codeDigits.length !== 12 || codeDigits === friendCode} onClick={() => void save({ friendCode: codeDigits }, t.my_code_saved)}>{t.save}</Button>
      </div>
      <Button tone="ghost" className="min-h-9 w-full text-sm" disabled={act.isPending} onClick={async () => { await save({ friendCode: 'random' }, t.admin_code_regenerated); }}>{t.admin_code_random}</Button>
      {error && <p className="text-sm text-berry">{error}</p>}
      <p className="text-xs text-ink-3">{t.admin_notified}</p>
    </div>
  );
}

/** Collections the account deleted, or an admin did, still restorable for 30 days. */
function UserTrash({ id }: { id: string }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const q = useAdminUserTrash(id);
  const restore = useAdminAction((listId: string) => api(`/admin/trash/${listId}/restore`, { method: 'POST' }));
  if (!q.data?.length) return null;
  return (
    <section>
      <p className="mb-1 text-xs font-medium text-ink-3">{t.admin_trash}</p>
      <ul className="divide-y divide-line rounded-lg border border-dashed border-line">
        {q.data.map((l) => (
          <li key={l.id} className="flex items-center gap-2 p-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{l.name}</span>
              <span className="block text-xs text-ink-3">{t.admin_trash_line(l.entries, l.by ?? '?', relativeTime(l.deletedAt, lang), Math.max(0, Math.ceil((new Date(l.purgeAt).getTime() - Date.now()) / 86400_000)))}</span>
            </span>
            <Button className="min-h-8 px-2 text-xs" disabled={restore.isPending} onClick={async () => { await restore.mutateAsync(l.id); toast(t.admin_restored); }}>{t.admin_restore}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The account's collections: rename one, or remove it. */
function UserLists({ id }: { id: string }) {
  const t = useT();
  const toast = useToast();
  const q = useAdminUserLists(id);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const rename = useAdminAction((v: { id: string; name: string }) => api(`/admin/lists/${v.id}`, { method: 'PATCH', body: { name: v.name } }));
  const remove = useAdminAction((listId: string) => api(`/admin/lists/${listId}`, { method: 'DELETE' }));
  if (!q.data?.length) return null;
  return (
    <section>
      <p className="mb-1 text-xs font-medium text-ink-3">{t.nav_lists}</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {q.data.map((l) => (
          <li key={l.id} className="p-2">
            {editing === l.id ? (
              <div className="flex gap-2">
                <input aria-label={t.list_name} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-[16px]" />
                <Button tone="primary" className="min-h-9 px-3 text-xs" disabled={!name.trim() || rename.isPending} onClick={async () => { await rename.mutateAsync({ id: l.id, name: name.trim() }); setEditing(null); toast(t.admin_renamed); }}>{t.save}</Button>
                <Button tone="ghost" className="min-h-9 px-2 text-xs" onClick={() => setEditing(null)}>{t.cancel}</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.name}</span>
                  <span className="tnum block text-xs text-ink-3">{l.entries} {t.admin_entries}</span>
                </span>
                <Button tone="ghost" className="min-h-8 px-2 text-xs" onClick={() => { setEditing(l.id); setName(l.name); setDeleting(null); }}>{t.admin_rename}</Button>
                {deleting === l.id ? (
                  <Button tone="danger" className="min-h-8 px-2 text-xs" disabled={remove.isPending} onClick={async () => { await remove.mutateAsync(l.id); setDeleting(null); toast(t.admin_list_deleted); }}>{t.admin_list_delete_confirm}</Button>
                ) : (
                  <Button tone="ghost" className="min-h-8 px-2 text-xs text-berry" onClick={() => setDeleting(l.id)}>{t.delete}</Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Signups() {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const q = useSignups();
  const save = useAdminAction((s: SignupSettings) => api('/admin/signups', { method: 'PUT', body: s }));
  const create = useAdminAction((b: { note?: string; maxUses: number; days: number }) => api<{ code: string }>('/admin/invites', { body: b }));
  const remove = useAdminAction((id: string) => api(`/admin/invites/${id}`, { method: 'DELETE' }));
  const [note, setNote] = useState('');
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(14);
  const [code, setCode] = useState<string | null>(null);
  if (!q.data) return <Spinner />;
  const s = q.data.settings;
  return (
    <>
      <section className="card p-3">
        <h2 className="text-base font-bold">{t.admin_signup_mode}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(['open', 'invite', 'closed'] as const).map((m) => (
            <Chip key={m} active={s.mode === m} onClick={() => save.mutate({ ...s, mode: m })}>{t.admin_mode[m]}</Chip>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-3">{t.admin_mode_hint[s.mode]}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.dailyCap !== null} onChange={(e) => save.mutate({ ...s, dailyCap: e.target.checked ? 20 : null })} className="h-5 w-5 accent-[var(--go)]" />
          {t.admin_daily_cap}
          {s.dailyCap !== null && (
            <input type="number" min={1} max={10000} defaultValue={s.dailyCap} onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v !== s.dailyCap) save.mutate({ ...s, dailyCap: v }); }} className="tnum w-20 rounded-lg border border-line bg-card px-2 py-1" aria-label={t.admin_daily_cap} />
          )}
        </label>
      </section>

      <section className="card p-3">
        <h2 className="text-base font-bold">{t.admin_invites}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.admin_invites_hint}</p>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <TextField label={t.admin_invite_note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} />
          <label className="text-sm"><span className="mb-1 block text-ink-2">{t.admin_invite_uses}</span><input type="number" min={1} max={100} value={uses} onChange={(e) => setUses(Number(e.target.value) || 1)} className="tnum min-h-11 w-16 rounded-xl border border-line bg-card px-2" /></label>
          <label className="text-sm"><span className="mb-1 block text-ink-2">{t.admin_invite_days}</span><input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value) || 14)} className="tnum min-h-11 w-16 rounded-xl border border-line bg-card px-2" /></label>
        </div>
        <Button tone="primary" className="mt-2 w-full" disabled={create.isPending} onClick={async () => { const r = (await create.mutateAsync({ note: note || undefined, maxUses: uses, days })) as { code: string }; setCode(r.code); setNote(''); }}>{t.admin_invite_create}</Button>
        {code && (
          <div className="mt-2 rounded-lg bg-go-soft p-2 text-go-ink">
            <p className="text-xs">{t.admin_code_once}</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="tnum flex-1 text-base font-bold">{code}</code>
              <CopyButton className="min-h-8 px-3 text-xs" text={code} />
            </div>
          </div>
        )}
        <ul className="mt-3 divide-y divide-line">
          {q.data.invites.map((i) => {
            const expired = i.expiresAt && Date.parse(i.expiresAt) < Date.now();
            return (
              <li key={i.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{i.note || t.admin_invite_untitled}</span>
                  <span className="tnum block text-xs text-ink-3">{t.admin_invite_used(i.uses, i.maxUses)} · {expired ? t.admin_invite_expired : i.expiresAt ? t.admin_invite_until(new Date(i.expiresAt).toLocaleDateString(lang)) : ''}</span>
                </span>
                <Button tone="ghost" className="min-h-8 px-2 text-xs" onClick={() => remove.mutate(i.id)}>{t.delete}</Button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** A journal line in words: "vulk passed MrVegazz to manager". */
function describe(e: AuditEntry, t: ReturnType<typeof useT>, variant: (key: string) => string): string {
  const d = e.data as Record<string, any>;
  const who = e.actor ?? '?';
  switch (e.action) {
    case 'user.role': return t.audit.role(who, d.username, t[`role_${d.after as Role}`] ?? d.after);
    case 'user.reset_code': return t.audit.reset(who, d.username);
    case 'user.logout_all': return t.audit.logout(who, d.username ?? e.targetId);
    case 'user.suspend': return t.audit.suspend(who, d.username);
    case 'user.rename': return t.audit.rename(who, d.before, d.after);
    case 'user.friend_code': return d.random ? t.audit.friendCodeRandom(who, d.username) : t.audit.friendCode(who, d.username);
    case 'list.rename': return t.audit.listRename(who, d.username, d.before, d.after);
    case 'list.delete': return who === d.username ? t.audit.listDeleteOwn(who, d.name) : t.audit.listDelete(who, d.username, d.name);
    case 'list.restore': return t.audit.listRestore(who, d.username ?? '?', d.name);
    case 'user.unsuspend': return t.audit.unsuspend(who, d.username);
    case 'user.delete': return t.audit.delete(who, d.username);
    // A player's own actions: named from the entry, the account may be gone since.
    case 'account.create': return d.invite ? t.audit.accountCreateInvite(d.username, d.invite.note ?? '') : t.audit.accountCreate(d.username);
    case 'account.password': return t.audit.accountPassword(d.username);
    case 'account.password_reset': return d.codeBy ? t.audit.accountReset(d.username, d.codeBy) : t.audit.accountResetUnknown(d.username);
    case 'account.friend_code': return t.audit.accountFriendCode(d.username);
    case 'account.delete': return t.audit.accountDelete(d.username);
    case 'account.login_suspended': return t.audit.accountSuspendedLogin(d.username);
    case 'override.set': return t.audit.override(who, variant(e.targetId ?? ''));
    case 'override.reset': return t.audit.overrideReset(who, variant(e.targetId ?? ''));
    case 'override.undo': return t.audit.undo(who, variant(e.targetId ?? ''));
    case 'settings.signups': return t.audit.signups(who, t.admin_mode[d.after?.mode as 'open'] ?? '');
    case 'invite.create': return t.audit.inviteCreate(who, d.note ?? '');
    case 'invite.delete': return t.audit.inviteDelete(who);
    case 'announcement.create': return t.audit.announce(who, d.message);
    case 'announcement.hide': return t.audit.announceHide(who);
    case 'announcement.show': return t.audit.announceShow(who);
    case 'source.refresh': return t.audit.source(who, t.admin_source[e.targetId as 'promo'] ?? e.targetId ?? '');
    default:
      if (e.action.startsWith('report.')) return t.audit.report(who, variant(e.targetId ?? ''), e.action.slice(7));
      return `${who} · ${e.action} ${e.targetId ?? ''}`;
  }
}

type Shown = { released?: boolean | null; label?: { en?: string; fr?: string } | null; genders?: string[] | null; shinyReleased?: boolean | null; noEvolve?: boolean | null; noMega?: boolean | null };

/**
 * What a variant correction changed, one line per field: "Nom FR : « K 2026 A » → « Kanto 2026 A »".
 * Newer entries carry what players saw before and after (was / now); older ones only the correction itself.
 */
function variantChanges(d: Record<string, any>, t: ReturnType<typeof useT>): string[] {
  const exact = !!(d.was || d.now);
  const from: Shown = exact ? (d.was ?? {}) : (d.before ?? {});
  const to: Shown = exact ? (d.now ?? {}) : (d.after ?? {});
  const yesNo = (b: boolean | null | undefined) => (b === null || b === undefined ? t.change_auto : b ? t.change_yes : t.change_no);
  const name = (s: string | undefined) => (s ? `« ${s} »` : '—');
  const sexes = (g: string[] | null | undefined) => (g === null || g === undefined ? t.change_auto : g.length === 0 ? t.change_genderless : g.map((x) => (x === 'm' ? '♂' : '♀')).join(''));
  const out: string[] = [];
  // Old entries: a field left empty in the correction was not touched.
  const touched = (k: keyof Shown) => exact || (to[k] !== null && to[k] !== undefined) || (from[k] !== null && from[k] !== undefined);
  if (touched('released') && yesNo(from.released) !== yesNo(to.released)) out.push(`${t.change_released} : ${yesNo(from.released)} → ${yesNo(to.released)}`);
  for (const l of ['fr', 'en'] as const) {
    if (touched('label') && (from.label?.[l] ?? '') !== (to.label?.[l] ?? '')) out.push(`${t.change_name(l)} : ${name(from.label?.[l])} → ${name(to.label?.[l])}`);
  }
  if (touched('genders') && sexes(from.genders) !== sexes(to.genders)) out.push(`${t.change_genders} : ${sexes(from.genders)} → ${sexes(to.genders)}`);
  const plain = (b: boolean | null | undefined) => (b === null || b === undefined ? t.change_auto : b ? t.change_yes_plain : t.change_no_plain);
  if (touched('shinyReleased') && plain(from.shinyReleased) !== plain(to.shinyReleased)) out.push(`${t.shiny_status} : ${plain(from.shinyReleased)} → ${plain(to.shinyReleased)}`);
  if (touched('noEvolve') && plain(from.noEvolve) !== plain(to.noEvolve)) out.push(`${t.no_evolve} : ${plain(from.noEvolve)} → ${plain(to.noEvolve)}`);
  if (touched('noMega') && plain(from.noMega) !== plain(to.noMega)) out.push(`${t.no_mega} : ${plain(from.noMega)} → ${plain(to.noMega)}`);
  return out;
}

function Journal() {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<AuditKind>('all');
  const q = useAudit(offset, kind);
  const undo = useAdminAction((id: string) => api(`/admin/audit/${id}/undo`, { method: 'POST' }));
  const dataset = useDataset();
  /** "Pikachu · Casque de verre" rather than the variant key. */
  const variant = (key: string) => {
    const idx = dataset.data;
    const sp = idx?.speciesByDex.get(Number(key.split('.')[0]));
    const v = idx?.variantByKey.get(key);
    return sp ? [localized(sp.name, lang), v?.label ? localized(v.label, lang) : ''].filter(Boolean).join(' · ') : key;
  };
  const kinds = (
    <div className="mb-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
      {(['all', 'accounts', 'lists', 'data', 'admin'] as AuditKind[]).map((k) => (
        <Chip key={k} active={kind === k} onClick={() => { setKind(k); setOffset(0); }}>{t.audit_kind[k]}</Chip>
      ))}
    </div>
  );
  if (!q.data) return <section>{kinds}<Spinner /></section>;
  return (
    <section>
      {kinds}
      {q.data.entries.length === 0 && <Empty>{t.nothing_here}</Empty>}
      <ul className="divide-y divide-line">
        {q.data.entries.map((e) => (
          <li key={e.id} className="flex items-start gap-2 py-2.5">
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${e.undoneAt ? 'text-ink-3 line-through' : ''}`}>{describe(e, t, variant)}</span>
              {e.action === 'user.suspend' && (e.data as any).reason && <span className="block text-xs text-ink-2">{t.audit_reason((e.data as any).reason)}</span>}
              {e.action === 'user.friend_code' && <span className="tnum block text-xs text-ink-2">{fmtCode(String((e.data as any).before))} → {fmtCode(String((e.data as any).after))}</span>}
              {e.action === 'account.friend_code' && <span className="tnum block text-xs text-ink-2">{fmtCode(String((e.data as any).before))} → {fmtCode(String((e.data as any).after))}</span>}
              {e.action === 'account.password_reset' && (e.data as any).codeAt && <span className="block text-xs text-ink-2">{t.audit_code_made(new Date((e.data as any).codeAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }))}</span>}
              {e.action.startsWith('override.') &&
                variantChanges(e.data as Record<string, any>, t).map((line) => (
                  <span key={line} className="block text-xs text-ink-2">{line}</span>
                ))}
              <span className="tnum block text-xs text-ink-3">{new Date(e.createdAt).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</span>
            </span>
            {e.targetType === 'variant' && e.targetId && <Link to={`/dex/${e.targetId.split('.')[0]}`} className="shrink-0 py-1 text-xs font-semibold text-sky">{t.admin_see}</Link>}
            {e.undoable && <Button tone="ghost" className="min-h-8 shrink-0 px-2 text-xs" disabled={undo.isPending} onClick={async () => { await undo.mutateAsync(e.id); toast(t.admin_undone); }}>{t.admin_undo}</Button>}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between">
        <Button tone="ghost" className="min-h-9" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>‹</Button>
        <Button tone="ghost" className="min-h-9" disabled={q.data.entries.length < 50} onClick={() => setOffset(offset + 50)}>›</Button>
      </div>
    </section>
  );
}

/** Players' reports, for admins here and for managers on the review page. */
export function Reports() {
  const t = useT();
  const { lang } = useLang();
  const [status, setStatus] = useState<'open' | 'handled'>('open');
  const q = useReports(status);
  const dataset = useDataset();
  const handle = useAdminAction((v: { id: string; status: Report['status'] }) => api(`/reports/${v.id}`, { method: 'PATCH', body: { status: v.status } }));
  const label = (key: string) => {
    const idx = dataset.data;
    const v = idx?.variantByKey.get(key);
    const sp = idx?.speciesByDex.get(Number(key.split('.')[0]));
    return [sp ? localized(sp.name, lang) : `#${key}`, v?.label ? localized(v.label, lang) : ''].filter(Boolean).join(' · ');
  };
  return (
    <section>
      <div className="mb-2 flex gap-2">
        <Chip active={status === 'open'} onClick={() => setStatus('open')}>{t.reports_open}</Chip>
        <Chip active={status === 'handled'} onClick={() => setStatus('handled')}>{t.reports_handled}</Chip>
      </div>
      {q.isPending && <Spinner />}
      {q.data?.length === 0 && <Empty>{status === 'open' ? t.reports_none : t.nothing_here}</Empty>}
      <ul className="space-y-2">
        {q.data?.map((r) => (
          <li key={r.id} className="card p-3">
            <div className="flex items-baseline gap-2">
              <Link to={`/dex/${r.variantKey.split('.')[0]}`} className="min-w-0 flex-1 truncate font-semibold text-sky">{label(r.variantKey)}</Link>
              <Badge tone="muted">{t.report_kinds[r.kind]}</Badge>
            </div>
            {r.message && <p className="mt-1 text-sm">{r.message}</p>}
            <p className="tnum mt-1 text-xs text-ink-3">{r.by ?? '?'} · {relativeTime(r.createdAt, lang)}{r.status !== 'open' ? ` · ${t.report_status[r.status]}` : ''}</p>
            <div className="mt-2 flex gap-2">
              {r.status === 'open' ? (
                <>
                  <Button tone="primary" className="min-h-9 flex-1 text-sm" onClick={() => handle.mutate({ id: r.id, status: 'resolved' })}>{t.report_resolve}</Button>
                  <Button tone="ghost" className="min-h-9 flex-1 text-sm" onClick={() => handle.mutate({ id: r.id, status: 'dismissed' })}>{t.report_dismiss}</Button>
                </>
              ) : (
                <Button tone="ghost" className="min-h-9 text-sm" onClick={() => handle.mutate({ id: r.id, status: 'open' })}>{t.report_reopen}</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Announcements() {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const q = useAdminAnnouncements();
  const create = useAdminAction((b: { message: string; level: 'info' | 'warning'; link?: string; push: boolean }) => api<{ pushed: number }>('/admin/announcements', { body: b }));
  const toggle = useAdminAction((v: { id: string; active: boolean }) => api(`/admin/announcements/${v.id}`, { method: 'PATCH', body: { active: v.active } }));
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<'info' | 'warning'>('info');
  const [link, setLink] = useState('');
  const [push, setPush] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const linkOk = !link || /^(\/|https:\/\/)/.test(link);
  const send = async () => {
    const r = (await create.mutateAsync({ message: message.trim(), level, link: link.trim() || undefined, push })) as { pushed: number };
    toast(push ? t.announce_sent_push(r.pushed) : t.announce_sent);
    setMessage(''); setLink(''); setPush(false); setConfirm(false);
  };
  return (
    <>
      <section className="card p-3">
        <h2 className="text-base font-bold">{t.announce_new}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{t.announce_hint}</p>
        <label className="mt-2 block">
          <span className="mb-1 block text-sm font-medium text-ink-2">{t.announce_message}</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} rows={3} className="w-full rounded-xl border border-line bg-card px-3 py-2 text-[16px]" />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip active={level === 'info'} onClick={() => setLevel('info')}>{t.announce_info}</Chip>
          <Chip active={level === 'warning'} onClick={() => setLevel('warning')}>{t.announce_warning}</Chip>
        </div>
        <TextField className="mt-2" label={t.announce_link} placeholder="/pvp/battle" value={link} onChange={(e) => setLink(e.target.value)} />
        {!linkOk && <p className="mt-1 text-xs text-berry">{t.announce_link_hint}</p>}
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={push} onChange={(e) => { setPush(e.target.checked); setConfirm(false); }} className="h-5 w-5 accent-[var(--go)]" />
          {t.announce_push(q.data?.pushAccounts ?? 0)}
        </label>
        {message.trim().length >= 3 && (
          <div className={`mt-3 rounded-xl p-2.5 text-sm ${level === 'warning' ? 'bg-shiny-soft text-[#7a5a0e] dark:text-shiny' : 'bg-sky/10 text-ink'}`}>
            <span className="text-xs font-semibold text-ink-3">{t.announce_preview} · </span>{message.trim()}
          </div>
        )}
        {push && confirm ? (
          <Button tone="danger" className="mt-2 w-full" disabled={create.isPending} onClick={send}>{t.announce_confirm_push(q.data?.pushAccounts ?? 0)}</Button>
        ) : (
          <Button tone="primary" className="mt-2 w-full" disabled={create.isPending || message.trim().length < 3 || !linkOk} onClick={() => (push ? setConfirm(true) : send())}>{t.announce_publish}</Button>
        )}
      </section>
      <ul className="space-y-2">
        {q.data?.announcements.map((a) => (
          <li key={a.id} className="card p-3">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-sm">{a.message}</p>
              {a.active && <Badge tone="grass">{t.announce_live}</Badge>}
            </div>
            <p className="tnum mt-1 text-xs text-ink-3">{relativeTime(a.createdAt, lang)}{a.pushedAt ? ` · ${t.announce_pushed(a.pushCount ?? 0)}` : ''}</p>
            <Button tone="ghost" className="mt-1 min-h-8 px-2 text-xs" onClick={() => toggle.mutate({ id: a.id, active: !a.active })}>{a.active ? t.announce_hide : t.announce_show}</Button>
          </li>
        ))}
      </ul>
    </>
  );
}
