import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { ListDetail, ListDetailEntry, ListEntry, ListVisibility } from '@mydexpogo/shared';
import { SearchStrings } from '../components/SearchStrings.js';
import { Sparkle, Sprite } from '../components/Sprite.js';
import { useToast } from '../components/toast.js';
import { Badge, Button, Chip, Empty, IconButton, Progress, Sheet, Spinner, TextField, TopBar } from '../components/ui.js';
import { copyText } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { entryVariant, genderSymbol, tagLabel, useDataset, type DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useCopyList, useDeleteList, useList, useRemoveEntries, useShareList, useSharedList, useUpdateList, type ListAccess } from '../lib/lists.js';
import { useUpsertEntries } from '../lib/lists.js';
import { VisibilityField } from './ListsPage.js';
import { useFollowList, useOffer } from '../lib/social.js';
import { cardDone, cardMissing, cardsOf, type EntryCard } from '../lib/cards.js';
import { exportListPdf, fileSlug } from '../lib/pdf.js';
import { renderListImage, shareOrDownload } from '../lib/shareImage.js';
import { exportSearchText } from '../lib/searchString.js';

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

type Q = { data?: { list: ListDetail; access: ListAccess; following?: boolean }; isPending: boolean; isError: boolean; error: unknown };

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
  return <ListBody idx={dataset.data} list={query.data.list} access={query.data.access} following={query.data.following} id={id} token={token} loggedIn={!!me.data} />;
}

type View = 'missing' | 'caught' | 'all';

function ListBody({ idx, list, access, following, id, token, loggedIn }: { idx: DatasetIndex; list: ListDetail; access: ListAccess; following?: boolean; id?: string; token?: string; loggedIn: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const owner = access === 'owner';
  const friend = access === 'friend';
  const offer = useOffer(list.id);
  const follow = useFollowList(list.id);
  const [exporting, setExporting] = useState<'image' | 'pdf' | null>(null);
  const [sharing, setSharing] = useState(false);
  const [exportMissing, setExportMissing] = useState(true);
  const [view, setView] = useState<View>('missing');
  const [strings, setStrings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<EntryCard | null>(null);
  const upsert = useUpsertEntries();
  const remove = useRemoveEntries();
  const update = useUpdateList(list.id);
  const del = useDeleteList();
  const share = useShareList();
  const copy = useCopyList();

  // One card per target; ♂ / ♀ are tracked inside it. A card is "missing" while one of its genders is.
  const allCards = useMemo(() => cardsOf(list.entries), [list.entries]);
  const cards = useMemo(() => allCards.filter((c) => view === 'all' || (view === 'caught' ? c.members.some((m) => m.done) : cardMissing(c))), [allCards, view]);
  const done = list.entries.filter((e) => e.done).length;

  const setDone = (members: ListDetailEntry[], value: boolean) =>
    upsert.mutate({ id: list.id, entries: members.map((m) => ({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag, done: value, note: m.note })) });
  const setOffer = (m: ListDetailEntry, on: boolean) => offer.mutate({ variantKey: m.variantKey, gender: m.gender, shiny: m.shiny, tag: m.tag, on });

  /** Owner: one gender caught / not caught. Friend: "I have this one" for that gender, if still hunted. */
  const toggleMember = (m: ListDetailEntry) => {
    if (friend) {
      if (!m.done) setOffer(m, !m.offeredByMe);
    } else if (owner) setDone([m], !m.done);
  };
  /** Tapping the card does it for every gender at once. */
  const toggleCard = (c: EntryCard) => {
    if (friend) {
      const open = c.members.filter((m) => !m.done);
      const on = !open.every((m) => m.offeredByMe);
      for (const m of open) if (!!m.offeredByMe !== on) setOffer(m, on);
    } else if (owner) setDone(c.members, cardMissing(c));
  };
  const search = useMemo(() => exportSearchText(idx, list.entries, lang), [idx, list.entries, lang]);
  const exportAs = async (kind: 'image' | 'pdf') => {
    setExporting(kind);
    try {
      if (kind === 'pdf') await exportListPdf(idx, list, lang, t, { onlyMissing: exportMissing, search });
      else {
        const blob = await renderListImage(idx, list, lang, t, { onlyMissing: exportMissing, search });
        if ((await shareOrDownload(blob, `${fileSlug(list.name)}.png`, list.name)) === 'downloaded') toast(t.image_saved);
      }
      setSharing(false);
    } catch {
      toast(t.err_generic);
    } finally {
      setExporting(null);
    }
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
          ) : friend && following !== undefined ? (
            <Button tone="ghost" className="min-h-9 shrink-0 px-3 text-sm" disabled={follow.isPending} onClick={() => follow.mutate(!following)}>
              {following ? t.unfollow : t.follow}
            </Button>
          ) : null
        }
      >
        <div className="mx-auto max-w-3xl px-3 pb-2">
          {!owner && <p className="muted text-sm">{t.by(list.ownerName)}</p>}
          {friend && <p className="muted text-sm">{t.offer_hint(list.ownerName)}</p>}
          {friend && following === false && <p className="muted text-sm">{t.unfollowed_hint}</p>}
          {list.description && <p className="muted text-sm">{list.description}</p>}
          <div className="mt-2 flex items-center gap-3">
            <Progress done={done} total={list.entries.length} />
            <span className="muted tnum shrink-0 text-xs font-semibold">{t.progress(done, list.entries.length)}</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {(['missing', 'caught', 'all'] as View[]).map((v) => (
              <Chip key={v} active={view === v} onClick={() => setView(v)}>{{ missing: t.missing, caught: t.caught, all: t.filter_all }[v]}</Chip>
            ))}
          </div>
<div className="mt-2 flex gap-2">
          <Button tone="ghost" className="flex-1 gap-2 bg-white text-go-ink shadow-card hover:bg-white dark:bg-white/15 dark:text-white dark:hover:bg-white/20" onClick={() => setStrings(true)} disabled={list.entries.length === 0}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>
            {t.copy_for_game}
          </Button>
            <Button tone="ghost" className="gap-2 bg-white text-go-ink shadow-card hover:bg-white dark:bg-white/15 dark:text-white dark:hover:bg-white/20" onClick={() => { setExportMissing(view !== 'all'); setSharing(true); }} disabled={list.entries.length === 0}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
              {t.export_share}
            </Button>
          </div>
        </div>
      </TopBar>

      <main className="mx-auto max-w-3xl px-3 pb-28">
        {list.entries.length === 0 && (
          <Empty>
            {t.empty_list}
            {owner && <><br /><Link to="/dex" className="mt-3 inline-block font-semibold text-sky">{t.nav_dex}</Link></>}
          </Empty>
        )}
        {list.entries.length > 0 && cards.length === 0 && <Empty>{view === 'missing' ? t.all_caught : view === 'caught' ? t.none_caught : t.nothing_here}</Empty>}
        {owner && cards.length > 0 && <p className="py-2 text-xs text-ink-3">{t.list_owner_hint}</p>}
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {cards.map((c) => {
            const v = entryVariant(idx, c.variantKey, c.members.every((m) => m.gender === 'f') ? 'f' : 'm');
            const sp = v && idx.speciesByDex.get(v.dex);
            if (!v || !sp) return null;
            const allDone = cardDone(c);
            const gendered = c.members.some((m) => m.gender);
            const myOffers = c.members.some((m) => m.offeredByMe);
            const offerLines = owner ? c.members.filter((m) => !m.done && m.offers?.length) : [];
            return (
              <li key={c.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 150px' }}>
                <div className={`card relative flex h-full flex-col items-center px-1 pb-2 pt-1 ${allDone ? 'ring-2 ring-go' : ''} ${myOffers ? 'ring-2 ring-sky' : ''}`}>
                  {owner && (
                    <button type="button" onClick={() => setSelected(c)} className="absolute left-0.5 top-0.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2" aria-label={t.entry_options} title={t.entry_options}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleCard(c)}
                    onContextMenu={(ev) => { ev.preventDefault(); setSelected(c); }}
                    aria-pressed={friend ? c.members.filter((m) => !m.done).every((m) => m.offeredByMe) : allDone}
                    aria-label={`${localized(sp.name, lang)}${v.label ? ` ${localized(v.label, lang)}` : ''}`}
                    className={`flex w-full flex-col items-center transition ${owner || (friend && cardMissing(c)) ? 'active:scale-[0.97]' : 'cursor-default'}`}
                  >
                    <div className="relative">
                      <Sprite idx={idx} variant={v} shiny={c.shiny} dim={!allDone} size={72} />
                      {c.shiny && <Sparkle className={`absolute -right-1 top-0 ${allDone ? 'text-shiny' : 'text-ink-3'}`} />}
                      {allDone && (
                        <span className="absolute -left-1 bottom-0 flex h-5 w-5 items-center justify-center rounded-full bg-go text-white">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                        </span>
                      )}
                      {v.datamined && !allDone && <span className="absolute -right-1 bottom-0 h-2 w-2 rounded-full bg-sky" />}
                    </div>
                    <span className="mt-1 w-full truncate text-center text-[12px] font-semibold leading-tight">{localized(sp.name, lang)}</span>
                    {v.label && <span className="w-full truncate text-center text-[10px] leading-tight text-ink-3">{localized(v.label, lang)}</span>}
                    {c.tag && <span className="w-full truncate text-center text-[10px] font-semibold leading-tight text-ink-2">{tagLabel(idx, c.tag, t)}</span>}
                  </button>
                  {gendered && (
                    <div className="mt-1 flex gap-1">
                      {c.members.map((m) => {
                        const label = `${genderSymbol(m.gender)} ${m.gender === 'm' ? t.male : t.female}`;
                        const state = m.done ? t.caught : m.offeredByMe ? t.offer_mine : t.missing;
                        return (
                          <button
                            key={m.gender}
                            type="button"
                            onClick={() => toggleMember(m)}
                            aria-pressed={friend ? !!m.offeredByMe : m.done}
                            aria-label={`${label} : ${state}`}
                            title={`${label} : ${state}`}
                            className={`flex h-7 min-w-9 items-center justify-center gap-0.5 rounded-full border-2 px-1.5 text-[13px] font-bold transition ${
                              m.done ? 'border-go bg-go text-white' : m.offeredByMe ? 'border-sky bg-sky/15 text-sky' : 'border-line text-ink-3'
                            }`}
                          >
                            {genderSymbol(m.gender)}
                            {m.done && <span className="text-[10px]">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {myOffers && <span className="mt-0.5 rounded-md bg-sky/15 px-1.5 text-[10px] font-bold text-sky">{t.offer_mine}</span>}
                  {offerLines.map((m) => (
                    <span key={m.gender} className="mt-0.5 max-w-full truncate rounded-md bg-sky/15 px-1.5 text-[10px] font-bold text-sky">
                      {genderSymbol(m.gender)} {t.offer_by(m.offers!.map((o) => o.username))}
                    </span>
                  ))}
                </div>
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

      {owner && (
        <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-[64px] z-20 px-3">
          <div className="mx-auto flex max-w-3xl justify-end">
            <Link to="/dex" className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full bg-go px-5 font-semibold text-white shadow-lg hover:brightness-110">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {t.add_pokemon}
            </Link>
          </div>
        </div>
      )}

      <Sheet open={sharing} onClose={() => setSharing(false)} title={t.export_title}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={exportMissing} onClick={() => setExportMissing(true)}>{t.export_scope_missing}</Chip>
            <Chip active={!exportMissing} onClick={() => setExportMissing(false)}>{t.export_scope_all}</Chip>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['image', 'pdf'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                disabled={!!exporting}
                onClick={() => exportAs(kind)}
                aria-label={kind === 'pdf' ? t.export_pdf : t.export_image}
                className="card flex flex-col items-start gap-1 p-3 text-left transition hover:brightness-[0.98] active:scale-[0.98] disabled:opacity-60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-go-soft text-go-ink">
                  {kind === 'image' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
                  )}
                </span>
                <span className="font-semibold">{exporting === kind ? t.export_working : kind === 'image' ? t.export_image : t.export_pdf_short}</span>
                <span className="text-xs text-ink-3">{kind === 'image' ? t.export_image_hint : t.export_pdf_hint}</span>
              </button>
            ))}
          </div>
          {search && <p className="text-xs text-ink-3">{t.export_with_search}</p>}
        </div>
      </Sheet>

      <Sheet open={strings} onClose={() => setStrings(false)} title={t.game_strings_title}>
        <SearchStrings idx={idx} entries={list.entries} />
      </Sheet>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? localized(idx.speciesByDex.get(idx.variantByKey.get(selected.variantKey)?.dex ?? 0)?.name, lang) : ''}>
        {selected && (
          <div className="space-y-2">
            {selected.members.map((m) => (
              <div key={m.gender} className="space-y-1">
                <Button className="w-full" onClick={() => { toggleMember(m); setSelected(null); }} disabled={!owner}>
                  {m.done ? t.mark_missing(genderSymbol(m.gender)) : t.mark_caught(genderSymbol(m.gender))}
                </Button>
                {owner && m.offers?.length ? <p className="text-sm text-ink-2">{genderSymbol(m.gender)} {t.offer_by(m.offers.map((o) => o.username))}</p> : null}
              </div>
            ))}
            <Link to={`/dex/${idx.variantByKey.get(selected.variantKey)?.dex}`} className="block"><Button className="w-full">{t.nav_dex}</Button></Link>
            {owner && (
              <Button tone="danger" className="w-full" onClick={async () => { await remove.mutateAsync({ id: list.id, entries: [{ variantKey: selected.variantKey, shiny: selected.shiny, tag: selected.tag }] }); setSelected(null); }}>
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
        <div className="rounded-card border border-line p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">{t.share} {shareUrl && <Badge tone="grass">{t.share_on}</Badge>}</div>
          {shareUrl ? (
            <div className="space-y-2">
              <code className="block break-all rounded-lg bg-paper-2 p-2 text-xs">{shareUrl}</code>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={async () => { if (await copyText(shareUrl)) toast(t.link_copied); }}>{t.copy_link}</Button>
                <Button tone="ghost" onClick={() => onShare(false)}>{t.share_off}</Button>
              </div>
            </div>
          ) : list.visibility === 'private' ? (
            <p className="text-sm text-ink-2">{t.share_private_hint}</p>
          ) : (
            <Button className="w-full" onClick={() => onShare(true)}>{t.copy_link}</Button>
          )}
        </div>
        <Button tone="danger" className="w-full" onClick={onDelete}>{t.delete}</Button>
      </div>
    </Sheet>
  );
}
