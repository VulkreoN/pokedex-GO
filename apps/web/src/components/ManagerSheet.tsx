import { useEffect, useState } from 'react';
import type { Gender, Variant } from '@mydexpogo/shared';
import type { VariantGroup } from './AddToList.js';
import { useOverrides, useSetOverride } from '../lib/admin.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet, TextField } from './ui.js';

/** Manager tools for one form/costume: force released / not released / automatic, rename it. Applies to every gender picture of the group. */
export function ManagerSheet({ group, onClose }: { group: VariantGroup | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const set = useSetOverride();
  const overrides = useOverrides(!!group);
  const [released, setReleased] = useState<boolean | null>(null);
  /** 'auto' follows the game master; the others pin the genders for forms it does not describe yet. */
  const [genders, setGenders] = useState<'auto' | 'mf' | 'm' | 'f' | 'none'>('auto');
  /** null = automatic (shiny list, game master). */
  const [shinyOut, setShinyOut] = useState<boolean | null>(null);
  const [noEvolve, setNoEvolve] = useState<boolean | null>(null);
  const [en, setEn] = useState('');
  const [fr, setFr] = useState('');
  useEffect(() => {
    if (!group) return;
    const v: Variant = group.variants[0]!;
    setReleased(v.datamined ? false : true);
    setEn(group.label?.en ?? '');
    setFr(group.label?.fr ?? '');
    const o = overrides.data?.find((x) => x.variantKey === v.key);
    const g = o?.genders;
    setGenders(!g ? 'auto' : g.length === 0 ? 'none' : g.length === 2 ? 'mf' : g[0] === 'm' ? 'm' : 'f');
    setShinyOut(o?.shinyReleased ?? null);
    setNoEvolve(o?.noEvolve ?? null);
  }, [group, overrides.data]);

  const save = async (mode: boolean | null) => {
    if (!group) return;
    const changed = en.trim() !== (group.label?.en ?? '') || fr.trim() !== (group.label?.fr ?? '');
    // Saving rewrites the whole correction: keep a rename made earlier unless the name was edited now.
    const previous = overrides.data?.find((x) => x.variantKey === group.variants[0]!.key)?.label ?? null;
    const label = changed ? (en.trim() ? { en: en.trim(), ...(fr.trim() ? { fr: fr.trim() } : {}) } : null) : previous;
    const g: Gender[] | null = { auto: null, mf: ['m', 'f'] as Gender[], m: ['m'] as Gender[], f: ['f'] as Gender[], none: [] as Gender[] }[genders];
    await Promise.all(group.variants.map((v) => set.mutateAsync({ variantKey: v.key, released: mode, label, genders: g, shinyReleased: shinyOut, noEvolve })));
    toast(t.saved);
    onClose();
  };

  return (
    <Sheet open={!!group} onClose={onClose} title={t.manage_variant}>
      {group && (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">{localized(group.label, lang) || t.normal} · {group.variants.map((v) => v.key).join(', ')}</p>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.release_status}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={released === true} onClick={() => setReleased(true)}>{t.mark_released}</Chip>
              <Chip active={released === false} onClick={() => setReleased(false)}>{t.mark_unreleased}</Chip>
              <Chip active={released === null} onClick={() => setReleased(null)}>{t.mark_auto}</Chip>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.genders_title}</p>
            <div className="flex flex-wrap gap-1.5">
              {(['auto', 'mf', 'm', 'f', 'none'] as const).map((k) => (
                <Chip key={k} active={genders === k} onClick={() => setGenders(k)}>{t[`genders_${k}`]}</Chip>
              ))}
            </div>
            {group.variants[0]!.gendersGuessed && genders === 'auto' && <p className="mt-1 text-xs text-ink-3">{t.genders_guessed}</p>}
          </div>
          {group.variants[0]!.hasShiny && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">{t.shiny_status}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={shinyOut === true} onClick={() => setShinyOut(true)}>{t.shiny_out}</Chip>
                <Chip active={shinyOut === false} onClick={() => setShinyOut(false)}>{t.shiny_not_out}</Chip>
                <Chip active={shinyOut === null} onClick={() => setShinyOut(null)}>{t.mark_auto}</Chip>
              </div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.evolve_status}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={noEvolve === false} onClick={() => setNoEvolve(false)}>{t.evolve_yes}</Chip>
              <Chip active={noEvolve === true} onClick={() => setNoEvolve(true)}>{t.no_evolve}</Chip>
              <Chip active={noEvolve === null} onClick={() => setNoEvolve(null)}>{t.mark_auto}</Chip>
            </div>
          </div>
          <TextField label={`${t.label_name} (EN)`} value={en} onChange={(e) => setEn(e.target.value)} maxLength={60} />
          <TextField label={`${t.label_name} (FR)`} value={fr} onChange={(e) => setFr(e.target.value)} maxLength={60} />
          <Button tone="primary" className="w-full" disabled={set.isPending} onClick={() => save(released)}>{t.save}</Button>
          <p className="text-xs text-ink-3">{t.manage_hint}</p>
        </div>
      )}
    </Sheet>
  );
}
