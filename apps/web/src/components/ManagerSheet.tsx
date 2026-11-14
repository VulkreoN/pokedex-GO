import { useEffect, useState } from 'react';
import type { Variant } from '@mydexpogo/shared';
import type { VariantGroup } from './AddToList.js';
import { useSetOverride } from '../lib/admin.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet, TextField } from './ui.js';

/** Manager tools for one form/costume: force released / not released / automatic, rename it. Applies to every gender picture of the group. */
export function ManagerSheet({ group, onClose }: { group: VariantGroup | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const set = useSetOverride();
  const [released, setReleased] = useState<boolean | null>(null);
  const [en, setEn] = useState('');
  const [fr, setFr] = useState('');
  useEffect(() => {
    if (!group) return;
    const v: Variant = group.variants[0]!;
    setReleased(v.datamined ? false : true);
    setEn(group.label?.en ?? '');
    setFr(group.label?.fr ?? '');
  }, [group]);

  const save = async (mode: boolean | null) => {
    if (!group) return;
    const changed = en.trim() !== (group.label?.en ?? '') || fr.trim() !== (group.label?.fr ?? '');
    const label = changed && en.trim() ? { en: en.trim(), ...(fr.trim() ? { fr: fr.trim() } : {}) } : null;
    await Promise.all(group.variants.map((v) => set.mutateAsync({ variantKey: v.key, released: mode, label })));
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
          <TextField label={`${t.label_name} (EN)`} value={en} onChange={(e) => setEn(e.target.value)} maxLength={60} />
          <TextField label={`${t.label_name} (FR)`} value={fr} onChange={(e) => setFr(e.target.value)} maxLength={60} />
          <Button tone="primary" className="w-full" disabled={set.isPending} onClick={() => save(released)}>{t.save}</Button>
          <p className="text-xs text-ink-3">{t.manage_hint}</p>
        </div>
      )}
    </Sheet>
  );
}
