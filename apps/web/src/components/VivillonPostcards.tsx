/**
 * Vivillon (Prismillon) regional gift postcards:
 * - `MyPostcardsCard`: declare which regional postcard patterns you can send (unlimited home region or travel count).
 * - `PostcardsDiscoverSection`: automatically detects missing Vivillon patterns from your collections and recommends
 *   trainers who have those postcards, with 1-tap friend request & pattern filters.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  VIVILLON_META,
  VIVILLON_PATTERNS,
  vivillonName,
  vivillonRegion,
  type UserPostcard,
  type VivillonPattern,
} from '@mydexpogo/shared';
import { useDataset, type DatasetIndex } from '../lib/dataset.js';
import { errorMessage, fmtCode } from '../lib/errors.js';
import { useLang, useT } from '../lib/i18n.js';
import {
  useDiscoverPostcards,
  useMyPostcards,
  useRespondFriendRequest,
  useSavePostcards,
  useSendFriendRequest,
} from '../lib/lists.js';
import { Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Badge, Button, Chip, CopyButton, Empty, Sheet, Spinner } from './ui.js';

export function VivillonSprite({ idx, pattern, size = 32 }: { idx?: DatasetIndex; pattern: VivillonPattern; size?: number }) {
  const variant = idx?.variantByKey.get(VIVILLON_META[pattern].variantKey);
  if (!idx || !variant) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-paper-2 text-xs font-bold text-ink-3"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        🦋
      </span>
    );
  }
  return <Sprite idx={idx} variant={variant} size={size} />;
}

/** Reusable pills displaying a trainer's declared Vivillon gift postcards (highlights wanted patterns in green). */
export function PostcardBadges({
  postcards,
  wantedSet,
  compact = false,
}: {
  postcards: UserPostcard[];
  wantedSet?: Set<VivillonPattern>;
  compact?: boolean;
}) {
  const { lang } = useLang();
  const dataset = useDataset();
  const sorted = useMemo(
    () =>
      [...postcards].sort(
        (a, b) =>
          Number(!!wantedSet?.has(b.pattern)) - Number(!!wantedSet?.has(a.pattern)) ||
          vivillonName(a.pattern, lang).localeCompare(vivillonName(b.pattern, lang), lang),
      ),
    [postcards, wantedSet, lang],
  );
  if (!sorted.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((p) => {
        const hit = !!wantedSet?.has(p.pattern);
        return (
          <span
            key={p.pattern}
            className={`inline-flex items-center gap-1 rounded-xl border font-semibold ${
              compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
            } ${hit ? 'border-go/60 bg-go-soft/50 text-go-ink dark:text-go' : 'border-line bg-paper/70 text-ink-2'}`}
          >
            <VivillonSprite idx={dataset.data} pattern={p.pattern} size={compact ? 18 : 24} />
            <span>{vivillonName(p.pattern, lang)}</span>
            <span className="tnum text-[10px] opacity-80">{p.quantity === null ? '∞' : `×${p.quantity}`}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Compact summary shown on Friends -> Add friend, linking to MePage where postcards are configured. */
export function MyPostcardsShortcutCard() {
  const t = useT();
  const mine = useMyPostcards();
  const list = mine.data ?? [];
  return (
    <section className="card space-y-2.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">🦋 {t.postcards_mine_title}</h2>
        <Link
          to="/me"
          className="inline-flex min-h-8 items-center rounded-xl bg-paper-2 px-2.5 text-xs font-semibold text-sky hover:brightness-95"
        >
          {t.postcards_edit_on_me} ›
        </Link>
      </div>
      {mine.isPending ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="text-xs leading-relaxed text-ink-2">{t.postcards_mine_shortcut_empty}</p>
      ) : (
        <PostcardBadges postcards={list} compact />
      )}
    </section>
  );
}

/** Card displaying the signed-in trainer's available Vivillon gift postcards + Sheet to manage them. */
export function MyPostcardsCard() {
  const t = useT();
  const { lang } = useLang();
  const dataset = useDataset();
  const mine = useMyPostcards();
  const [editing, setEditing] = useState(false);

  const sortedMine = useMemo(() => {
    const list = [...(mine.data ?? [])];
    list.sort((a, b) => vivillonName(a.pattern, lang).localeCompare(vivillonName(b.pattern, lang), lang));
    return list;
  }, [mine.data, lang]);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-snug">🦋 {t.postcards_mine_title}</h2>
        </div>
        <Button tone="ghost" className="min-h-9 shrink-0 bg-paper-2 px-3 text-xs font-semibold hover:brightness-95" onClick={() => setEditing(true)}>
          {t.postcards_mine_edit}
        </Button>
      </div>

      {mine.isPending ? (
        <Spinner />
      ) : sortedMine.length === 0 ? (
        <p className="text-xs leading-relaxed text-ink-2">{t.postcards_mine_empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sortedMine.map((p) => (
            <span
              key={p.pattern}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper/70 px-2 py-1 text-xs font-semibold"
            >
              <VivillonSprite idx={dataset.data} pattern={p.pattern} size={26} />
              <span>{vivillonName(p.pattern, lang)}</span>
              <span className="tnum rounded-full bg-paper-2 px-1.5 py-0.5 text-[11px] font-bold text-ink-2">
                {p.quantity === null ? '∞' : `×${p.quantity}`}
              </span>
            </span>
          ))}
        </div>
      )}

      <PostcardsEditSheet open={editing} onClose={() => setEditing(false)} initial={mine.data ?? []} idx={dataset.data} />
    </section>
  );
}

/** Modal Sheet allowing a trainer to toggle each of the 18 regional Vivillon patterns & set Unlimited vs finite count. */
function PostcardsEditSheet({
  open,
  onClose,
  initial,
  idx,
}: {
  open: boolean;
  onClose: () => void;
  initial: UserPostcard[];
  idx?: DatasetIndex;
}) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const save = useSavePostcards();
  const [draft, setDraft] = useState<Map<VivillonPattern, number | null>>(() => new Map());

  useEffect(() => {
    if (open) {
      setDraft(new Map(initial.map((p) => [p.pattern, p.quantity])));
    }
  }, [open, initial]);

  const sortedPatterns = useMemo(
    () => [...VIVILLON_PATTERNS].sort((a, b) => vivillonName(a, lang).localeCompare(vivillonName(b, lang), lang)),
    [lang],
  );

  const toggle = (pattern: VivillonPattern) => {
    setDraft((prev) => {
      const next = new Map(prev);
      if (next.has(pattern)) next.delete(pattern);
      else next.set(pattern, null);
      return next;
    });
  };

  const setQty = (pattern: VivillonPattern, quantity: number | null) => {
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(pattern, quantity === null ? null : Math.max(1, Math.min(999, quantity)));
      return next;
    });
  };

  const submit = async () => {
    const payload: UserPostcard[] = [...draft.entries()].map(([pattern, quantity]) => ({ pattern, quantity }));
    try {
      await save.mutateAsync(payload);
      toast(t.postcards_saved);
      onClose();
    } catch (err) {
      toast(errorMessage(t, err));
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`🦋 ${t.postcards_sheet_title}`}>
      {open && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-2">{t.postcards_sheet_hint}</p>

          <div className="space-y-1.5">
            {sortedPatterns.map((pattern) => {
              const selected = draft.has(pattern);
              const qty = draft.get(pattern) ?? null;
              const name = vivillonName(pattern, lang);
              return (
                <div
                  key={pattern}
                  className={`rounded-xl border p-2.5 transition ${selected ? 'border-go bg-go-soft/25' : 'border-line bg-card'}`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(pattern)}
                    className="flex w-full items-center gap-2.5 text-left"
                  >
                    <VivillonSprite idx={idx} pattern={pattern} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-tight">{name}</span>
                      <span className="block truncate text-[11px] text-ink-3">{vivillonRegion(pattern, lang)}</span>
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        selected ? 'border-go bg-go text-white' : 'border-line bg-paper text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  </button>

                  {selected && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/60 pt-2">
                      <button
                        type="button"
                        aria-pressed={qty === null}
                        onClick={() => setQty(pattern, null)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          qty === null ? 'border-go bg-go text-white' : 'border-line bg-card text-ink-2 hover:border-ink-3'
                        }`}
                      >
                        ∞ {t.postcards_unlimited}
                      </button>
                      <button
                        type="button"
                        aria-pressed={qty !== null}
                        onClick={() => setQty(pattern, qty ?? 3)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          qty !== null ? 'border-go bg-go text-white' : 'border-line bg-card text-ink-2 hover:border-ink-3'
                        }`}
                      >
                        {t.postcards_limited}
                      </button>
                      {qty !== null && (
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`− ${name}`}
                            onClick={() => setQty(pattern, qty - 1)}
                            disabled={qty <= 1}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-card text-sm font-bold disabled:opacity-40"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={999}
                            aria-label={`${t.postcards_limited} ${name}`}
                            value={qty}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (!Number.isNaN(n)) setQty(pattern, n);
                            }}
                            className="tnum h-7 w-14 rounded-lg border border-line bg-card px-1.5 text-center text-sm font-bold"
                          />
                          <button
                            type="button"
                            aria-label={`+ ${name}`}
                            onClick={() => setQty(pattern, qty + 1)}
                            disabled={qty >= 999}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-card text-sm font-bold disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-0 -mx-4 border-t border-line bg-card/95 px-4 pb-1 pt-3 backdrop-blur">
            <Button tone="primary" className="w-full" disabled={save.isPending} onClick={submit}>
              {t.save} ({draft.size})
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Discovery feed suggesting trainers to add as friends based on missing Vivillon patterns or chosen filters. */
export function PostcardsDiscoverSection() {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const dataset = useDataset();
  const [mode, setMode] = useState<'auto' | 'all' | 'custom'>('auto');
  const [picked, setPicked] = useState<VivillonPattern[]>([]);

  const queryOpts = useMemo(() => {
    if (mode === 'all') return { all: true };
    if (mode === 'custom' && picked.length > 0) return { patterns: picked };
    return {};
  }, [mode, picked]);

  const discover = useDiscoverPostcards(queryOpts);
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondFriendRequest();
  const [busyId, setBusyId] = useState<string | null>(null);

  const wantedPatterns = discover.data?.wantedPatterns ?? [];
  const wantedSet = useMemo(() => new Set(wantedPatterns), [wantedPatterns]);
  const suggestions = discover.data?.suggestions ?? [];

  const sortedPatterns = useMemo(
    () => [...VIVILLON_PATTERNS].sort((a, b) => vivillonName(a, lang).localeCompare(vivillonName(b, lang), lang)),
    [lang],
  );

  const togglePattern = (pattern: VivillonPattern) => {
    setPicked((prev) => {
      const next = prev.includes(pattern) ? prev.filter((p) => p !== pattern) : [...prev, pattern];
      setMode(next.length > 0 ? 'custom' : 'auto');
      return next;
    });
  };

  const addTrainer = async (friendCode: string, userId: string) => {
    setBusyId(userId);
    try {
      const r = await sendRequest.mutateAsync(friendCode);
      toast(r.accepted ? t.now_friends(r.friend!.username) : t.sent_to(r.to!.username));
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setBusyId(null);
    }
  };

  const acceptTrainer = async (requestId: string, username: string, userId: string) => {
    setBusyId(userId);
    try {
      await respondRequest.mutateAsync({ id: requestId, action: 'accept' });
      toast(t.now_friends(username));
    } catch (err) {
      toast(errorMessage(t, err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold">🌍 {t.postcards_discover_title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{t.postcards_intro}</p>
      </div>

      {/* Auto-detected missing Vivillon patterns from collections */}
      {wantedPatterns.length > 0 && (
        <div className="rounded-card border border-go/35 bg-go-soft/35 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="grass">✨ {t.postcards_wanted_banner(wantedPatterns.length)}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {wantedPatterns.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold shadow-sm">
                <VivillonSprite idx={dataset.data} pattern={p} size={20} />
                {vivillonName(p, lang)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mode chips + manual pattern filter chips */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {wantedPatterns.length > 0 && (
            <Chip
              active={mode === 'auto'}
              onClick={() => { setMode('auto'); setPicked([]); }}
              className="min-h-8 px-2.5 text-xs"
            >
              {t.postcards_filter_wanted}
            </Chip>
          )}
          <Chip
            active={mode === 'all' || (wantedPatterns.length === 0 && mode === 'auto')}
            onClick={() => { setMode('all'); setPicked([]); }}
            className="min-h-8 px-2.5 text-xs"
          >
            {t.postcards_filter_all}
          </Chip>
        </div>

        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {sortedPatterns.map((pattern) => {
            const active = mode === 'custom' && picked.includes(pattern);
            const wanted = wantedSet.has(pattern);
            return (
              <button
                key={pattern}
                type="button"
                aria-pressed={active}
                onClick={() => togglePattern(pattern)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold transition ${
                  active
                    ? 'border-go bg-go text-white'
                    : wanted
                      ? 'border-go/50 bg-go-soft/40 text-ink hover:border-go'
                      : 'border-line bg-card text-ink-2 hover:border-ink-3'
                }`}
              >
                <VivillonSprite idx={dataset.data} pattern={pattern} size={20} />
                <span>{vivillonName(pattern, lang)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {discover.isPending ? (
        <Spinner />
      ) : discover.isError ? (
        <Empty>{t.err_generic}</Empty>
      ) : suggestions.length === 0 ? (
        <Empty>{t.postcards_discover_empty}</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          {suggestions.map((s) => {
            const matchedSet = new Set(s.matchedPatterns);
            const sortedCards = [...s.postcards].sort(
              (a, b) => Number(matchedSet.has(b.pattern)) - Number(matchedSet.has(a.pattern)) || vivillonName(a.pattern, lang).localeCompare(vivillonName(b.pattern, lang), lang),
            );
            const isBusy = busyId === s.user.id;
            return (
              <li
                key={s.user.id}
                className={`card flex flex-col gap-2.5 p-3 ${s.matchedPatterns.length > 0 ? 'ring-1 ring-go/45' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-bold">{s.user.username}</span>
                      {s.matchedPatterns.length > 0 && (
                        <Badge tone="grass">{t.postcards_match_badge(s.matchedPatterns.length)}</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                      <span className="tnum font-mono">{fmtCode(s.user.friendCode)}</span>
                      <CopyButton text={s.user.friendCode} tone="ghost" className="min-h-6 px-1.5 py-0 text-[11px]" />
                    </div>
                  </div>
                  <div className="shrink-0">
                    {s.requestStatus === 'none' && (
                      <Button
                        tone="primary"
                        className="min-h-9 px-3 text-xs"
                        disabled={isBusy}
                        onClick={() => addTrainer(s.user.friendCode, s.user.id)}
                      >
                        {t.postcards_add_btn}
                      </Button>
                    )}
                    {s.requestStatus === 'outgoing' && <Badge tone="muted">{t.postcards_sent_badge}</Badge>}
                    {s.requestStatus === 'incoming' && s.requestId && (
                      <Button
                        tone="primary"
                        className="min-h-9 px-3 text-xs"
                        disabled={isBusy}
                        onClick={() => acceptTrainer(s.requestId!, s.user.username, s.user.id)}
                      >
                        {t.postcards_incoming_btn}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {sortedCards.map((p) => {
                    const hit = matchedSet.has(p.pattern);
                    return (
                      <span
                        key={p.pattern}
                        className={`inline-flex items-center gap-1 rounded-xl border px-2 py-0.5 text-xs font-semibold ${
                          hit ? 'border-go/60 bg-go-soft/50 text-go-ink dark:text-go' : 'border-line bg-paper/60 text-ink-2'
                        }`}
                      >
                        <VivillonSprite idx={dataset.data} pattern={p.pattern} size={24} />
                        <span>{vivillonName(p.pattern, lang)}</span>
                        <span className="tnum text-[11px] opacity-80">{p.quantity === null ? '∞' : `×${p.quantity}`}</span>
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
