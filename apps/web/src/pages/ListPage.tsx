import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { ListDetail, ListEntry, ListVisibility } from '@mydexpogo/shared';
import { SearchStrings } from '../components/SearchStrings.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { useToast } from '../components/toast.js';
import { Badge, Button, Chip, Empty, IconButton, Progress, Sheet, Spinner, TextField, TopBar } from '../components/ui.js';
import { copyText } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { useDataset, type DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCopyList, useDeleteList, useList, useRemoveEntries, useShareList, useSharedList, useUpdateList, type ListAccess } from '../lib/lists.js';
import { useUpsertEntries } from '../lib/lists.js';
import { VisibilityField } from './ListsPage.js';

export function ListPage() {
  const { id } = useParams<{ id: string }>();
  const q = useList(id!);
  return <ListView query={q} id={id!} />;
}

export function SharedListPage() {
  const { token } = useParams<{ token: string }>();
  const q = useSharedList(token!);
  return <ListView query={q} token={token!} />;
}

type Q = { data?: { list: ListDetail; access: ListAccess }; isPending: boolean; isError: boolean; error: unknown };

function ListView({ query, id, token }: { query: Q; id?: string; token?: string }) {
  const t = useT();
  const dataset = useDataset();
  const me = useMe();
  if (query.isPending || dataset.isPending) return <Spinner />;
  if (query.isError || !query.data || !dataset.data) {
    return (
      <>
        <TopBar title={t.nav_lists} back />
        <Empty>
          {t.err_not_found}
          {!me.data && <><br /><Link to="/login" className="mt-2 inline-block font-semibold text-sky">{t.login_required}</Link></>}
        </Empty>
      </>
    );
  }
  return <ListBody idx={dataset.data} list={query.data.list} access={query.data.access} id={id} token={token} loggedIn={!!me.data} />;
}

type View = 'missing' | 'caught' | 'all';

function ListBody({ idx, list, access, id, token, loggedIn }: { idx: DatasetIndex; list: ListDetail; access: ListAccess; id?: string; token?: string; loggedIn: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const owner = access === 'owner';
  const [view, setView] = useState<View>('missing');
  const [strings, setStrings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<ListEntry | null>(null);
  const upsert = useUpsertEntries();
  const remove = useRemoveEntries();
  const update = useUpdateList(list.id);
  const del = useDeleteList();
  const share = useShareList();
  const copy = useCopyList();

  const entries = useMemo(() => list.entries.filter((e) => view === 'all' || (view === 'caught' ? e.done : !e.done)), [list.entries, view]);
  const done = list.entries.filter((e) => e.done).length;

  const toggle = (e: ListEntry) => {
    if (!owner) return;
    upsert.mutate({ id: list.id, entries: [{ variantKey: e.variantKey, shiny: e.shiny, done: !e.done, note: e.note }] });
  };

  const shareUrl = list.shareToken ? `${location.origin}/s/${list.shareToken}` : null;

  return (
    <>
      <TopBar
        title={list.name}
        back
        actions={
          owner ? (
            <IconButton label={t.edit} onClick={() => setEditing(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </IconButton>
          ) : null
        }
      >
        <div className="mx-auto max-w-3xl px-3 pb-2">
          {!owner && <p className="text-sm text-[var(--ink-2)]">{t.by(list.ownerName)}</p>}
          {list.description && <p className="text-sm text-[var(--ink-2)]">{list.description}</p>}
          <div className="mt-2 flex items-center gap-3">
            <Progress done={done} total={list.entries.length} />
            <span className="tnum shrink-0 text-xs font-semibold text-[var(--ink-2)]">{t.progress(done, list.entries.length)}</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {(['missing', 'caught', 'all'] as View[]).map((v) => (
              <Chip key={v} active={view === v} onClick={() => setView(v)}>{{ missing: t.missing, caught: t.caught, all: t.filter_all }[v]}</Chip>
            ))}
          </div>
          <Button tone="primary" className="mt-2 w-full gap-2" onClick={() => setStrings(true)} disabled={list.entries.length === 0}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>
            {t.copy_for_game}
          </Button>
        </div>
      </TopBar>

      <main className="mx-auto max-w-3xl px-3 pb-28">
        {list.entries.length === 0 && (
          <Empty>
            {t.empty_list}
            {owner && <><br /><Link to="/dex" className="mt-3 inline-block font-semibold text-sky">{t.nav_dex}</Link></>}
          </Empty>
        )}
        {list.entries.length > 0 && entries.length === 0 && <Empty>{t.nothing_here}</Empty>}
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {entries.map((e) => {
            const v = idx.variantByKey.get(e.variantKey);
            const sp = v && idx.speciesByDex.get(v.dex);
            if (!v || !sp) return null;
            return (
              <li key={`${e.variantKey}:${e.shiny}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 118px' }}>
                <button
                  type="button"
                  onClick={() => toggle(e)}
                  onContextMenu={(ev) => { ev.preventDefault(); setSelected(e); }}
                  aria-pressed={e.done}
                  className={`flex w-full flex-col items-center rounded-card px-1 pb-2 pt-1 transition ${e.done ? 'bg-grass-2/70 dark:bg-grass/15' : 'bg-[var(--paper-2)]/60'} ${owner ? 'hover:brightness-95 active:scale-[0.97]' : 'cursor-default'}`}
                >
                  <div className="relative">
                    <Sprite idx={idx} variant={v} shiny={e.shiny} muted={!e.done} size={72} />
                    {e.shiny && <Sparkle className={`absolute -right-1 top-0 ${e.done ? 'text-shiny' : 'text-[var(--ink-3)]'}`} />}
                    {e.done && (
                      <span className="absolute -left-1 bottom-0 flex h-5 w-5 items-center justify-center rounded-full bg-grass text-white">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                      </span>
                    )}
                    {v.datamined && !e.done && <span className="absolute -right-1 bottom-0 h-2 w-2 rounded-full bg-sky" />}
                  </div>
                  <span className="mt-1 w-full truncate text-center text-[12px] font-semibold leading-tight">{localized(sp.name, lang)}</span>
                  <span className="w-full truncate text-center text-[10px] leading-tight text-[var(--ink-3)]">{[localized(v.label, lang), v.gender === 'f' ? '♀' : v.gender === 'm' ? '♂' : ''].filter(Boolean).join(' ')}</span>
                </button>
                {owner && (
                  <button type="button" onClick={() => setSelected(e)} className="mt-0.5 w-full text-center text-[10px] text-[var(--ink-3)] hover:text-berry" aria-label={t.remove_entry}>···</button>
                )}
              </li>
            );
          })}
        </ul>

        {!owner && loggedIn && (
          <Button
            tone="primary"
            className="mt-6 w-full"
            disabled={copy.isPending}
            onClick={async () => {
              const r = await copy.mutateAsync(token ? { token } : { id: list.id });
              toast(t.list_copied);
              navigate(`/lists/${r.list.id}`);
            }}
          >
            {t.copy_list}
          </Button>
        )}
        {!owner && !loggedIn && (
          <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold text-sky">{t.login_required}</Link></p>
        )}
      </main>

      <Sheet open={strings} onClose={() => setStrings(false)} title={t.game_strings_title}>
        <SearchStrings idx={idx} entries={list.entries} />
      </Sheet>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? localized(idx.speciesByDex.get(idx.variantByKey.get(selected.variantKey)?.dex ?? 0)?.name, lang) : ''}>
        {selected && (
          <div className="space-y-2">
            <Button className="w-full" onClick={() => { toggle(selected); setSelected(null); }} disabled={!owner}>
              {selected.done ? t.missing : t.caught}
            </Button>
            <Link to={`/dex/${idx.variantByKey.get(selected.variantKey)?.dex}`} className="block"><Button className="w-full">{t.nav_dex}</Button></Link>
            {owner && (
              <Button tone="danger" className="w-full" onClick={async () => { await remove.mutateAsync({ id: list.id, entries: [{ variantKey: selected.variantKey, shiny: selected.shiny }] }); setSelected(null); }}>
                {t.remove_entry}
              </Button>
            )}
          </div>
        )}
      </Sheet>

      {owner && id && (
        <EditSheet
          open={editing}
          onClose={() => setEditing(false)}
          list={list}
          shareUrl={shareUrl}
          onSave={async (body) => { await update.mutateAsync(body); setEditing(false); }}
          onShare={async (on) => { await share.mutateAsync({ id: list.id, on }); }}
          onDelete={async () => { if (confirm(t.confirm_delete_list)) { await del.mutateAsync(list.id); navigate('/lists'); } }}
        />
      )}
    </>
  );
}

function EditSheet({ open, onClose, list, shareUrl, onSave, onShare, onDelete }: { open: boolean; onClose: () => void; list: ListDetail; shareUrl: string | null; onSave: (b: { name: string; description: string | null; visibility: ListVisibility }) => Promise<void>; onShare: (on: boolean) => Promise<void>; onDelete: () => Promise<void> }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [visibility, setVisibility] = useState<ListVisibility>(list.visibility);
  return (
    <Sheet open={open} onClose={onClose} title={t.edit}>
      <div className="space-y-3">
        <TextField label={t.list_name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <TextField label={t.list_description} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        <VisibilityField value={visibility} onChange={setVisibility} />
        <Button tone="primary" className="w-full" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), description: description.trim() || null, visibility })}>{t.save}</Button>
        <div className="rounded-card border border-[var(--dust)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">{t.share} {shareUrl && <Badge tone="grass">{t.share_on}</Badge>}</div>
          {shareUrl ? (
            <div className="space-y-2">
              <code className="block break-all rounded-lg bg-[var(--paper-2)] p-2 text-xs">{shareUrl}</code>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={async () => { if (await copyText(shareUrl)) toast(t.link_copied); }}>{t.copy_link}</Button>
                <Button tone="ghost" onClick={() => onShare(false)}>{t.share_off}</Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" onClick={() => onShare(true)}>{t.copy_link}</Button>
          )}
        </div>
        <Button tone="danger" className="w-full" onClick={onDelete}>{t.delete}</Button>
      </div>
    </Sheet>
  );
}
