import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ListVisibility } from '@mydexpogo/shared';
import { Button, Empty, IconButton, Progress, Sheet, Spinner, TextField, TopBar } from '../components/ui.js';
import { useT } from '../lib/i18n.js';
import { useCreateList, useLists } from '../lib/lists.js';

export function VisibilityField({ value, onChange }: { value: ListVisibility; onChange: (v: ListVisibility) => void }) {
  const t = useT();
  const opts: [ListVisibility, string][] = [['private', t.vis_private], ['friends', t.vis_friends], ['link', t.vis_link]];
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink-2">{t.list_visibility}</legend>
      <div className="space-y-1">
        {opts.map(([v, label]) => (
          <label key={v} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-paper-2">
            <input type="radio" name="visibility" value={v} checked={value === v} onChange={() => onChange(v)} className="h-4 w-4 accent-go" />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function VisibilityIcon({ v }: { v: ListVisibility }) {
  const t = useT();
  const label = { private: t.vis_private, friends: t.vis_friends, link: t.vis_link }[v];
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className="text-ink-3">
      {v === 'private' && <path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />}
      {v === 'friends' && <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />}
      {v === 'link' && <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />}
    </svg>
  );
}

export function ListsPage() {
  const t = useT();
  const lists = useLists();
  const create = useCreateList();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>('friends');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), description: description.trim() || null, visibility });
    setOpen(false);
    setName('');
    setDescription('');
  };

  return (
    <>
      <TopBar
        title={t.my_lists}
        actions={
          <IconButton label={t.new_list} onClick={() => setOpen(true)} className="bg-ink text-paper hover:bg-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </IconButton>
        }
      />
      <main className="mx-auto max-w-3xl px-3 pb-24">
        {lists.isPending && <Spinner />}
        {lists.data?.length === 0 && (
          <Empty>
            {t.no_lists_yet}
            <br />
            <Button tone="primary" className="mt-4" onClick={() => setOpen(true)}>{t.new_list}</Button>
          </Empty>
        )}
        <ul className="space-y-2">
          {lists.data?.map((l) => (
            <li key={l.id}>
              <Link to={`/lists/${l.id}`} className="card block p-3 transition hover:brightness-[0.98]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{l.name}</span>
                  <VisibilityIcon v={l.visibility} />
                </div>
                {l.description && <p className="mt-0.5 truncate text-sm text-ink-2">{l.description}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <Progress done={l.doneCount} total={l.entryCount} />
                  <span className="tnum shrink-0 text-xs font-semibold text-ink-2">{t.progress(l.doneCount, l.entryCount)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.new_list}>
        <form onSubmit={submit} className="space-y-3">
          <TextField label={t.list_name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
          <TextField label={t.list_description} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          <VisibilityField value={visibility} onChange={setVisibility} />
          <Button tone="primary" className="w-full" type="submit" disabled={create.isPending || !name.trim()}>{t.create}</Button>
        </form>
      </Sheet>
    </>
  );
}
