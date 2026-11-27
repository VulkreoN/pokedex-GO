import { useState } from 'react';
import type { VariantKind } from '@mydexpogo/shared';
import type { VariantGroup } from './AddToList.js';
import { useBulkOverride, type OverrideLabelInput } from '../lib/admin.js';
import { useLang, useT } from '../lib/i18n.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet, TextField } from './ui.js';
import { RECLASSIFY_PRESETS, VARIANT_KINDS, type ReclassifyPreset } from './ManagerSheet.js';

/** 'keep' leaves the field as each variant has it; null puts it back on automatic. */
type Choice = 'keep' | true | false | null;
type LabelChoice = 'keep' | 'set' | 'reset';

/** Managers: one correction for every ticked card (category, name, released, shiny out, flags, visibility). */
export function BulkManageSheet({ open, groups, onClose, onDone }: { open: boolean; groups: VariantGroup[]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const bulk = useBulkOverride();
  const [released, setReleased] = useState<Choice>('keep');
  const [shiny, setShiny] = useState<Choice>('keep');
  const [noEvolve, setNoEvolve] = useState<Choice>('keep');
  const [noMega, setNoMega] = useState<Choice>('keep');
  const [kind, setKind] = useState<VariantKind | null | 'keep'>('keep');
  const [hidden, setHidden] = useState<Choice>('keep');
  const [labelChoice, setLabelChoice] = useState<LabelChoice>('keep');
  const [fr, setFr] = useState('');
  const [en, setEn] = useState('');
  const keys = groups.flatMap((g) => g.variants.map((v) => v.key));
  const labelReady = labelChoice === 'reset' || (labelChoice === 'set' && !!(fr.trim() || en.trim()));
  const nothing = released === 'keep' && shiny === 'keep' && noEvolve === 'keep' && noMega === 'keep' && kind === 'keep' && hidden === 'keep' && !labelReady;

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

  const applyPreset = (p: ReclassifyPreset) => {
    setKind(p.kind);
    setLabelChoice('set');
    setFr(p.label.fr);
    setEn(p.label.en);
  };

  const save = async () => {
    const field = (c: Choice) => (c === 'keep' ? undefined : c);
    let label: OverrideLabelInput | undefined;
    if (labelChoice === 'reset') label = null;
    else if (labelChoice === 'set' && (fr.trim() || en.trim())) {
      label = { ...(en.trim() ? { en: en.trim() } : {}), ...(fr.trim() ? { fr: fr.trim() } : {}) };
    }
    try {
      const r = await bulk.mutateAsync({
        keys,
        released: field(released),
        label,
        shinyReleased: field(shiny),
        noEvolve: field(noEvolve),
        noMega: field(noMega),
        kind: kind === 'keep' ? undefined : kind,
        hidden: field(hidden),
      });
      const baseMsg = t.bulk_managed(groups.length);
      toast(r.removedEntries ? t.saved_with_sync(baseMsg, r.updatedLists ?? 0, r.removedEntries) : baseMsg);
      setReleased('keep');
      setShiny('keep');
      setNoEvolve('keep');
      setNoMega('keep');
      setKind('keep');
      setHidden('keep');
      setLabelChoice('keep');
      setFr('');
      setEn('');
      onDone();
      onClose();
    } catch {
      toast(t.err_generic);
    }
  };

  const willSyncCollections = shiny === false || released === false || hidden === true;
  const footer = open ? (
    <Button tone="primary" className="w-full" disabled={nothing || bulk.isPending} onClick={save}>{t.save}</Button>
  ) : undefined;

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_manage_title(groups.length)} footer={footer}>
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-3">{t.kind_status}</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={kind === 'keep'} onClick={() => setKind('keep')}>{t.bulk_keep}</Chip>
            {VARIANT_KINDS.map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{t.kinds[k]}</Chip>)}
            <Chip active={kind === null} onClick={() => setKind(null)}>{t.mark_auto}</Chip>
          </div>
          <p className="mb-1 mt-2 text-[11px] font-medium text-ink-3">{t.manage_reclassify}</p>
          <div className="flex flex-wrap gap-1.5">
            {RECLASSIFY_PRESETS.map((p) => (
              <Chip
                key={p.id}
                active={kind === p.kind && labelChoice === 'set' && fr === p.label.fr && en === p.label.en}
                onClick={() => applyPreset(p)}
                className="min-h-7 px-2 text-xs"
              >
                {lang === 'fr' ? p.chipFr : p.chipEn}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-3">{t.label_name}</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={labelChoice === 'keep'} onClick={() => setLabelChoice('keep')}>{t.bulk_keep}</Chip>
            <Chip active={labelChoice === 'set'} onClick={() => setLabelChoice('set')}>{t.bulk_label_set}</Chip>
            <Chip active={labelChoice === 'reset'} onClick={() => setLabelChoice('reset')}>{t.mark_auto}</Chip>
          </div>
          {labelChoice === 'set' && (
            <div className="mt-2 space-y-2">
              {lang === 'fr' ? (
                <>
                  <TextField label={`${t.label_name} (FR)`} value={fr} onChange={(e) => setFr(e.target.value)} maxLength={60} />
                  <TextField label={`${t.label_name} (EN)`} value={en} onChange={(e) => setEn(e.target.value)} maxLength={60} />
                </>
              ) : (
                <>
                  <TextField label={`${t.label_name} (EN)`} value={en} onChange={(e) => setEn(e.target.value)} maxLength={60} />
                  <TextField label={`${t.label_name} (FR)`} value={fr} onChange={(e) => setFr(e.target.value)} maxLength={60} />
                </>
              )}
            </div>
          )}
        </div>
        {row(t.release_status, released, setReleased, [t.mark_released, t.mark_unreleased])}
        {row(t.shiny_status, shiny, setShiny, [t.shiny_out, t.shiny_not_out])}
        {/* "Can't evolve" is the true side here. */}
        {row(t.evolve_status, noEvolve, setNoEvolve, [t.no_evolve, t.evolve_yes])}
        {row(t.mega_status, noMega, setNoMega, [t.no_mega, t.mega_yes])}
        {row(t.variant_visibility, hidden, setHidden, [t.variant_hide_short, t.variant_show_short])}
        {willSyncCollections && (
          <p className="rounded-xl bg-sky/10 px-3 py-2 text-xs text-ink-2">{t.manage_collection_sync_hint}</p>
        )}
        <p className="text-xs text-ink-3">{t.bulk_manage_hint}</p>
      </div>
    </Sheet>
  );
}
