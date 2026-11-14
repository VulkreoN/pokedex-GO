import { useMemo, useState } from 'react';
import { buildSearchStrings, targetFromVariant, type ListEntry } from '@mydexpogo/shared';
import type { DatasetIndex } from '../lib/dataset.js';
import { copyText } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useToast } from './toast.js';
import { Button, Chip } from './ui.js';

export function SearchStrings({ idx, entries }: { idx: DatasetIndex; entries: ListEntry[] }) {
  const t = useT();
  const toast = useToast();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const strings = useMemo(() => {
    const targets = entries
      .filter((e) => !onlyMissing || !e.done)
      .flatMap((e) => {
        const v = idx.variantByKey.get(e.variantKey);
        const sp = v && idx.speciesByDex.get(v.dex);
        return v && sp ? [targetFromVariant(v, e.shiny, sp.genderDiff)] : [];
      });
    return buildSearchStrings(targets);
  }, [entries, idx, onlyMissing]);

  const label = (mods: string[]) => (mods.length ? mods.map((m) => ({ shiny: t.shiny, costume: t.filter_costumes, female: t.female, male: t.male, gigantamax: 'Gigantamax' })[m] ?? m).join(' + ') : t.filter_all);

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--ink-2)]">{t.game_strings_help}</p>
      <Chip active={onlyMissing} onClick={() => setOnlyMissing((v) => !v)}>
        {t.only_missing}
      </Chip>
      {strings.length === 0 && <p className="py-6 text-center text-sm text-[var(--ink-3)]">{t.nothing_here}</p>}
      <ul className="space-y-2">
        {strings.map((s) => (
          <li key={s.text} className="rounded-card border border-[var(--dust)] p-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                {label(s.modifiers)}
                {s.batches > 1 && <span className="text-[var(--ink-3)]"> {s.batch}/{s.batches}</span>}
              </span>
              <span className="tnum text-[var(--ink-3)]">{s.count}</span>
            </div>
            <code className="block break-all rounded-lg bg-[var(--paper-2)] p-2 text-[13px] leading-snug">{s.text}</code>
            <Button
              tone="primary"
              className="mt-2 w-full"
              onClick={async () => {
                if (await copyText(s.text)) toast(t.copied);
              }}
            >
              {t.copy}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
