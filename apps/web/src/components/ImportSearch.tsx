import { useMemo, useState } from 'react';
import { importFromSearch, parseGameSearch, type ListDetail, type Variant } from '@mydexpogo/shared';
import { InitialStatusField } from './AddToList.js';
import { useAddPrefs } from '../lib/addPrefs.js';
import { entryVariant, type DatasetIndex } from '../lib/dataset.js';
import { useT } from '../lib/i18n.js';
import { useUpsertEntries } from '../lib/lists.js';
import { errorMessage } from '../lib/errors.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Button, Chip } from './ui.js';

type Extra = 'costume' | 'mega' | 'gmax' | 'datamined';

/** Pastes an in-game search string and adds every Pokémon it shows to the collection (as missing or already caught). */
export function ImportSearch({ idx, list, onDone }: { idx: DatasetIndex; list: ListDetail; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const upsert = useUpsertEntries();
  const [prefs, setPrefs] = useAddPrefs();
  const [text, setText] = useState('');
  const [markExistingCaught, setMarkExistingCaught] = useState(true);
  const [extras, setExtras] = useState<Partial<Record<Extra, boolean>>>({});
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseGameSearch(text, idx.ds.species), [text, idx]);
  // Costumes, Megas and Gigantamax come only when the search asks for them or when ticked.
  // Not released yet: only when ticked.
  const on = (k: Extra) => extras[k] ?? (k !== 'datamined' && parsed.wants.has(k === 'gmax' ? 'gigantamax' : k));
  const unreleased = (key: string) => !!idx.variantByKey.get(key)?.datamined;
  const all = useMemo(() => importFromSearch(parsed, idx.ds.variants), [parsed, idx]);
  const existingDone = useMemo(
    () => new Map(list.entries.map((e) => [`${e.variantKey}|${e.gender}|${e.shiny}|${e.tag}`, e.done])),
    [list.entries],
  );
  const kept = all.filter((e) => (e.kind !== 'costume' || on('costume')) && (e.kind !== 'mega' || on('mega')) && (e.kind !== 'gmax' || on('gmax')) && (!unreleased(e.variantKey) || on('datamined')));
  const fresh = kept.filter((e) => !existingDone.has(`${e.variantKey}|${e.gender}|${e.shiny}|${e.tag}`));
  const existingUncaught = kept.filter((e) => existingDone.get(`${e.variantKey}|${e.gender}|${e.shiny}|${e.tag}`) === false);
  const toUpdate = prefs.done && markExistingCaught ? existingUncaught : [];
  const toSend = [...fresh, ...toUpdate];
  const count = (k: Variant['kind'] | 'datamined') => all.filter((e) => (k === 'datamined' ? unreleased(e.variantKey) : e.kind === k)).length;

  const add = async () => {
    setError(null);
    try {
      const entries = toSend.map(({ variantKey, gender, shiny, tag }) => ({ variantKey, gender, shiny, tag, done: prefs.done }));
      for (let k = 0; k < entries.length; k += 1000) await upsert.mutateAsync({ id: list.id, entries: entries.slice(k, k + 1000) });
      toast(t.import_added(entries.length));
      onDone();
    } catch (e) {
      setError(errorMessage(t, e));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t.import_hint}</p>
      <label className="block">
        <span className="sr-only">{t.import_label}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="1-151&!costume&!shiny"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t.import_label}
          className="w-full rounded-xl border border-line bg-card p-3 font-mono text-[15px] text-ink placeholder:text-ink-3 focus:border-sky"
        />
      </label>
      <InitialStatusField done={prefs.done} onChange={(done) => setPrefs({ done })} />
      {prefs.done && existingUncaught.length > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={markExistingCaught}
            onChange={(e) => setMarkExistingCaught(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-go"
          />
          <span>{t.import_mark_existing} ({existingUncaught.length})</span>
        </label>
      )}
      {(count('costume') > 0 || count('mega') > 0 || count('gmax') > 0 || count('datamined') > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {(['costume', 'mega', 'gmax', 'datamined'] as const).map((k) =>
            count(k) > 0 ? (
              <Chip key={k} active={on(k)} onClick={() => setExtras((x) => ({ ...x, [k]: !on(k) }))}>
                {t.import_extra[k]} · {count(k)}
              </Chip>
            ) : null,
          )}
        </div>
      )}
      {parsed.ignored.length > 0 && <p className="text-xs text-ink-3">{t.import_ignored(parsed.ignored.join(', '))}</p>}
      {text.trim() && (
        <div className="rounded-card border border-line p-3">
          <p className="text-sm font-semibold">
            {toUpdate.length > 0
              ? t.import_preview_update(fresh.length, toUpdate.length)
              : t.import_preview(fresh.length, kept.length - fresh.length)}
          </p>
          {toSend.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-0.5">
              {toSend.slice(0, 24).map((e) => {
                const v = entryVariant(idx, e.variantKey, e.gender === 'f' ? 'f' : 'm');
                return v ? (
                  <span key={`${e.variantKey}${e.gender}${e.shiny}${e.tag}`} className="relative">
                    <Sprite idx={idx} variant={v} shiny={e.shiny} size={36} />
                    {e.shiny && <Sparkle className="absolute -right-0.5 top-0 h-2.5 w-2.5 text-shiny" />}
                  </span>
                ) : null;
              })}
              {toSend.length > 24 && <span className="text-xs font-semibold text-ink-3">+{toSend.length - 24}</span>}
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-berry">{error}</p>}
      <Button tone="primary" className="w-full" disabled={!toSend.length || upsert.isPending} onClick={add}>
        {toSend.length ? t.import_add(toSend.length) : t.import_add_none}
      </Button>
    </div>
  );
}
