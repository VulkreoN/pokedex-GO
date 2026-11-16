import { useState } from 'react';
import { ENTRY_TAGS, type EntryTag } from '@mydexpogo/shared';
import type { VariantGroup } from './AddToList.js';
import type { GenderFilter } from './VariantCard.js';
import { useT } from '../lib/i18n.js';
import { selection } from '../lib/selection.js';
import { useToast } from './toast.js';
import { Button, Chip, Sheet } from './ui.js';

/** Adds the same versions / traits for every ticked card, respecting the gender filter, into the selection basket. */
export function BulkAddSheet({ open, groups, gender, onClose, onDone }: { open: boolean; groups: VariantGroup[]; gender: GenderFilter; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [versions, setVersions] = useState<'normal' | 'shiny' | 'both'>('normal');
  const [tags, setTags] = useState<Set<EntryTag>>(new Set(['']));
  const toggleTag = (tg: EntryTag) =>
    setTags((prev) => {
      if (tg === '') return new Set(['']);
      const n = new Set(prev);
      n.delete('');
      n.has(tg) ? n.delete(tg) : n.add(tg);
      return n.size ? n : new Set(['']);
    });

  const entries = () => {
    const out: { variantKey: string; shiny: boolean; tag: EntryTag }[] = [];
    for (const g of groups) {
      const vs = gender === 'all' ? g.variants : [g.variants.find((v) => v.gender === gender) ?? g.variants[0]!];
      for (const v of vs) {
        const shinies = versions === 'normal' ? [false] : versions === 'shiny' ? [true] : [false, true];
        for (const shiny of shinies) {
          if (shiny && !v.hasShiny) continue;
          for (const tag of tags) out.push({ variantKey: v.key, shiny, tag });
        }
      }
    }
    return out;
  };
  const count = entries().length;

  return (
    <Sheet open={open} onClose={onClose} title={t.bulk_title(groups.length)}>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.bulk_versions}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['normal', 'shiny', 'both'] as const).map((v) => (
          <Chip key={v} active={versions === v} onClick={() => setVersions(v)}>{{ normal: t.bulk_normal, shiny: t.bulk_shiny, both: t.bulk_both }[v]}</Chip>
        ))}
      </div>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{t.trait}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ENTRY_TAGS.map((tg) => (
          <Chip key={tg} active={tags.has(tg)} onClick={() => toggleTag(tg)} className="min-h-8 px-2.5 text-xs">{t[`tag_${tg}`]}</Chip>
        ))}
      </div>
      <p className="mb-3 text-xs text-ink-3">{t.bulk_gender_note(gender === 'all' ? t.gender_both : gender === 'm' ? t.male : t.female)}</p>
      <Button
        tone="primary"
        className="w-full"
        disabled={count === 0}
        onClick={() => {
          const e = entries();
          selection.add(e);
          toast(t.added_to_selection(e.length));
          onDone();
          onClose();
        }}
      >
        {t.bulk_add(count)}
      </Button>
    </Sheet>
  );
}
