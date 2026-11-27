import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { GameLang } from '@mydexpogo/shared';
import { FriendQr } from '../components/FriendQr.js';
import { InstallBanner } from '../components/InstallBanner.js';
import { PushSettings } from '../components/PushSettings.js';
import { useToast } from '../components/toast.js';
import { Button, Chip, CopyButton, Spinner, SwitchThumb } from '../components/ui.js';
import { api } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { markChangelogSeen } from '../lib/changelog.js';
import { useDataset } from '../lib/dataset.js';
import { useLang, useT } from '../lib/i18n.js';
import { buildTemplateEntries, type ListTemplateId } from '../lib/listTemplates.js';
import { useCreateList, useUpsertEntries } from '../lib/lists.js';
import { saveGameLang, savedGameLang } from '../lib/searchString.js';
import { enableGuidedTours } from '../lib/tour.js';
import { FriendCodeForm, fmtCode } from './FriendsPage.js';

const STEPS = ['hello', 'game', 'list', 'friends', 'notify'] as const;
type Step = (typeof STEPS)[number];
const TEMPLATES = ['shiny', 'lucky', 'dex', 'empty'] as const;
const TEMPLATE_MAP: Record<(typeof TEMPLATES)[number], ListTemplateId> = {
  shiny: 'shiny_released',
  lucky: 'lucky_released',
  dex: 'living_released',
  empty: 'empty',
};

/** First steps of a new account: what the app does, the game's language, a first list, friends, notifications. */
export function WelcomePage() {
  const t = useT();
  const { lang } = useLang();
  const me = useMe();
  const dataset = useDataset();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateList();
  const upsert = useUpsertEntries();
  const [step, setStep] = useState<Step>('hello');
  const [gameLang, setGameLang] = useState<GameLang>(() => savedGameLang(lang));
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number] | null>('shiny');
  const [prefill, setPrefill] = useState(true);
  const [creatingList, setCreatingList] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [codeSaved, setCodeSaved] = useState(false);
  const [guidesOn, setGuidesOn] = useState(true);

  const previewEntries = useMemo(() => {
    if (!template || template === 'empty' || !dataset.data) return [];
    return buildTemplateEntries(dataset.data, TEMPLATE_MAP[template]);
  }, [template, dataset.data]);

  if (me.isPending) return <Spinner />;
  if (!me.data) return <Navigate to="/login" replace />;
  const i = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(i + 1, STEPS.length - 1)]!);
  const back = () => setStep(STEPS[Math.max(i - 1, 0)]!);

  /** Done or skipped: not shown again; the new list if one was made, the Pokédex otherwise. */
  const finish = async (opts?: { to?: string; skipped?: boolean }) => {
    if (!opts?.skipped && guidesOn) {
      enableGuidedTours(true);
      markChangelogSeen();
    }
    await api('/auth/onboarded', { method: 'POST' }).catch(() => {});
    qc.setQueryData(['me'], { ...me.data, onboarded: true });
    navigate(opts?.to ?? (listId ? `/lists/${listId}` : '/dex'), { replace: true });
  };

  const makeList = async () => {
    if (listId || !template) return next();
    setCreatingList(true);
    try {
      const r = await create.mutateAsync({
        name: t.welcome_templates[template].name,
        description: t.welcome_templates[template].description || null,
        visibility: 'friends',
      });
      if (prefill && template !== 'empty' && dataset.data) {
        const entries = buildTemplateEntries(dataset.data, TEMPLATE_MAP[template]);
        for (let k = 0; k < entries.length; k += 1000) {
          await upsert.mutateAsync({ id: r.list.id, entries: entries.slice(k, k + 1000), insertOnly: true });
        }
      }
      setListId(r.list.id);
      next();
    } catch {
      toast(t.err_generic);
    } finally {
      setCreatingList(false);
    }
  };

  const page = (title: string, text: ReactNode, body: ReactNode, action: ReactNode) => (
    <>
      <h1 className="text-[28px] font-extrabold leading-tight">{title}</h1>
      <div className="mt-2 text-[15px] text-ink-2">{text}</div>
      <div className="mt-6">{body}</div>
      <div className="mt-8 flex gap-2">
        {i > 0 && <Button tone="ghost" onClick={back}>{t.welcome_back}</Button>}
        {action}
      </div>
    </>
  );

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col px-4 pb-28 pt-10">
      <div className="mb-8 flex items-center gap-3">
        <ol className="flex flex-1 gap-1.5" aria-label={t.welcome_progress(i + 1, STEPS.length)}>
          {STEPS.map((s, k) => <li key={s} className={`h-1.5 flex-1 rounded-full ${k <= i ? 'bg-go' : 'bg-paper-2'}`} />)}
        </ol>
        <button type="button" onClick={() => finish({ skipped: true })} className="text-sm font-semibold text-ink-3 hover:text-ink">{t.welcome_skip}</button>
      </div>

      {step === 'hello' &&
        page(
          t.welcome_hello(me.data.username),
          t.welcome_hello_text,
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {(['dex', 'lists', 'game', 'pvp', 'friends', 'me'] as const).map((k) => (
              <li key={k} className="card flex items-start gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-go-soft text-lg" aria-hidden="true">{{ dex: '📖', lists: '✅', game: '🗓️', pvp: '⚔️', friends: '🤝', me: '🏅' }[k]}</span>
                <span>
                  <span className="block font-semibold">{t.welcome_points[k].title}</span>
                  <span className="block text-xs leading-snug text-ink-2">{t.welcome_points[k].text}</span>
                </span>
              </li>
            ))}
          </ul>,
          <Button tone="primary" className="flex-1" onClick={next}>{t.welcome_start}</Button>,
        )}

      {step === 'game' &&
        page(
          t.welcome_game_title,
          t.welcome_game_text,
          <div className="flex gap-2">
            {(['fr', 'en'] as const).map((l) => (
              <Chip key={l} active={gameLang === l} onClick={() => setGameLang(l)} className="min-h-11 flex-1 justify-center text-base">{l === 'fr' ? 'Français' : 'English'}</Chip>
            ))}
          </div>,
          <Button tone="primary" className="flex-1" onClick={() => { saveGameLang(gameLang); next(); }}>{t.welcome_next}</Button>,
        )}

      {step === 'list' &&
        page(
          t.welcome_list_title,
          t.welcome_list_text,
          <div className="space-y-2" role="radiogroup">
            {TEMPLATES.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={template === k} disabled={!!listId || creatingList} onClick={() => setTemplate(k)} className={`card block w-full p-3 text-left outline-offset-0 transition disabled:opacity-60 ${template === k ? 'outline outline-2 outline-go' : ''}`}>
                <span className="block font-semibold">{t.welcome_templates[k].name}</span>
                <span className="block text-sm text-ink-2">{t.welcome_templates[k].hint}</span>
              </button>
            ))}
            {template && template !== 'empty' && !listId && (
              <button
                type="button"
                aria-pressed={prefill}
                disabled={creatingList}
                onClick={() => setPrefill((v) => !v)}
                className="flex w-full items-center gap-3 rounded-card border border-line bg-paper-2/50 px-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{t.welcome_prefill_toggle}</span>
                  {previewEntries.length > 0 && (
                    <span className="tnum block text-xs text-ink-3">{t.welcome_prefill_count(previewEntries.length)}</span>
                  )}
                </span>
                <SwitchThumb on={prefill} />
              </button>
            )}
            {listId && <p className="text-sm font-semibold text-go-ink dark:text-go">{t.welcome_list_done}</p>}
          </div>,
          <>
            <Button tone="ghost" disabled={creatingList} onClick={() => { setTemplate(null); next(); }}>{t.welcome_later}</Button>
            <Button tone="primary" className="flex-1" disabled={create.isPending || creatingList} onClick={makeList}>
              {creatingList ? t.template_filling : listId ? t.welcome_next : t.welcome_list_create}
            </Button>
          </>,
        )}

      {/* The friend code of the game, now or later; once saved, the code and QR to hand out. */}
      {step === 'friends' &&
        page(
          codeSaved ? t.welcome_friends_title : t.welcome_code_title,
          codeSaved ? t.welcome_friends_text : t.welcome_code_text,
          codeSaved ? (
            <div className="sky-header flex flex-col items-center gap-3 rounded-card p-4">
              <div className="text-sm opacity-80">{t.my_code}</div>
              <div className="tnum text-[26px] font-bold tracking-wider">{fmtCode(me.data.friendCode)}</div>
              <FriendQr code={me.data.friendCode} size={160} />
              <CopyButton tone="ghost" className="bg-white/15 text-inherit hover:bg-white/25" text={me.data!.friendCode} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="card p-4">
                <FriendCodeForm current={me.data.friendCode} onSaved={() => setCodeSaved(true)} note={false} />
              </div>
              <p className="text-sm text-ink-3">{t.welcome_code_meanwhile(fmtCode(me.data.friendCode))}</p>
            </div>
          ),
          codeSaved ? <Button tone="primary" className="flex-1" onClick={next}>{t.welcome_next}</Button> : <Button tone="ghost" className="flex-1" onClick={next}>{t.welcome_later}</Button>,
        )}

      {step === 'notify' &&
        page(
          t.welcome_notify_title,
          t.welcome_notify_text,
          <div className="space-y-3">
            <button
              type="button"
              aria-pressed={guidesOn}
              onClick={() => setGuidesOn((v) => !v)}
              className="card flex w-full items-center gap-3 p-3 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-go-soft text-lg" aria-hidden="true">🧭</span>
              <span className="min-w-0 flex-1 text-sm font-semibold">{t.welcome_enable_guides}</span>
              <SwitchThumb on={guidesOn} />
            </button>
            <PushSettings />
            <InstallBanner dismissible={false} />
          </div>,
          <Button tone="primary" className="flex-1" onClick={() => finish()}>{listId ? t.welcome_done_list : t.welcome_done}</Button>,
        )}
    </main>
  );
}
