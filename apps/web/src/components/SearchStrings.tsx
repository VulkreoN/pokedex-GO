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
        return v && sp ? [targetFromVariant(v, e.shiny, sp.genderDiff, e.tag)] : [];
      });
    return buildSearchStrings(targets);
  }, [entries, idx, onlyMissing]);

  const names: Record<string, string> = { shiny: t.shiny, costume: t.filter_costumes, female: t.female, gigantamax: 'Gigantamax', lucky: t.tag_lucky, background: t.tag_background, shadow: t.tag_shadow, purified: t.tag_purified, dynamax: t.tag_dynamax, xxl: t.tag_xxl, xxs: t.tag_xxs };
  const label = (mods: string[]) => (mods.length ? mods.map((m) => names[m] ?? m).join(' + ') : t.filter_all);

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">{t.game_strings_help}</p>
      <Chip active={onlyMissing} onClick={() => setOnlyMissing((v) => !v)}>
        {t.only_missing}
      </Chip>
      {strings.length === 0 && <p className="py-6 text-center text-sm text-ink-3">{t.nothing_here}</p>}
      <ul className="space-y-2">
        {strings.map((s) => (
          <li key={s.text} className="rounded-card border border-line bg-paper p-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">
                {label(s.modifiers)}
                {s.batches > 1 && <span className="text-ink-3"> {s.batch}/{s.batches}</span>}
              </span>
              <span className="tnum text-ink-3">{s.count}</span>
            </div>
            <code className="block break-all rounded-lg bg-paper-2 p-2 text-[13px] leading-snug">{s.text}</code>
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
