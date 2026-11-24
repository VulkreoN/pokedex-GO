import { useState } from 'react';
import type { VariantGroup } from './AddToList.js';
import { useBulkOverride } from '../lib/admin.js';
import { useT } from '../lib/i18n.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet } from './ui.js';

/** 'keep' leaves the field as each variant has it; null puts it back on automatic. */
type Choice = 'keep' | true | false | null;

/** Managers: one correction for every ticked card (released, shiny out, can't evolve). Names and genders are kept. */
export function BulkManageSheet({ open, groups, onClose, onDone }: { open: boolean; groups: VariantGroup[]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const bulk = useBulkOverride();
  const [released, setReleased] = useState<Choice>('keep');
  const [shiny, setShiny] = useState<Choice>('keep');
  const [noEvolve, setNoEvolve] = useState<Choice>('keep');
  const keys = groups.flatMap((g) => g.variants.map((v) => v.key));
  const nothing = released === 'keep' && shiny === 'keep' && noEvolve === 'keep';

  const row = (title: string, value: Choice, set: (c: Choice) => void, labels: [string, string]) => (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={value === 'keep'} onClick={() => set('keep')}>{t.bulk_keep}</Chip>
        <Chip active={value === true} onClick={() => set(true)}>{labels[0]}</Chip>
        <Chip active={value === false} onClick={() => set(false)}>{labels[1]}</Chip>
        <Chip active={value === null} onClick={() => set(null)}>{t.mark_auto}</Chip>
      </div>
    </div>
  );

  const save = async () => {
    // Left out of the request (undefined) = not touched.
    const field = (c: Choice) => (c === 'keep' ? undefined : c);
    await bulk.mutateAsync({ keys, released: field(released), shinyReleased: field(shiny), noEvolve: field(noEvolve) });
    toast(t.bulk_managed(groups.length));
    setReleased('keep');
    setShiny('keep');
    setNoEvolve('keep');
    onDone();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_manage_title(groups.length)}>
      <div className="space-y-4">
        {row(t.release_status, released, setReleased, [t.mark_released, t.mark_unreleased])}
        {row(t.shiny_status, shiny, setShiny, [t.shiny_out, t.shiny_not_out])}
        {/* "Can't evolve" is the true side here. */}
        {row(t.evolve_status, noEvolve, setNoEvolve, [t.no_evolve, t.evolve_yes])}
        <Button tone="primary" className="w-full" disabled={nothing || bulk.isPending} onClick={save}>{t.save}</Button>
        <p className="text-xs text-ink-3">{t.bulk_manage_hint}</p>
      </div>
    </Sheet>
  );
}
