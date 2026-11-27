import type { Gender, Variant } from '@mydexpogo/shared';
import { useOverrides, useSetOverride } from '../lib/admin.js';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Chip } from './ui.js';

const CHOICES: [string, Gender[]][] = [['genders_mf', ['m', 'f']], ['genders_m', ['m']], ['genders_f', ['f']], ['genders_none', []]];

/**
 * New costumes the published game master does not describe yet: the app offers the species' genders until a
 * manager confirms. One tap per costume; it then leaves this list.
 */
export function GenderReview({ idx }: { idx: DatasetIndex }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const overrides = useOverrides(true);
  const set = useSetOverride();
  const todo = idx.ds.variants.filter((v) => v.gendersGuessed && v.gender !== 'f');
  if (!todo.length) return null;

  const confirm = async (v: Variant, genders: Gender[]) => {
    // Keep what managers already set on this variant (release status, name).
    const prev = overrides.data?.find((o) => o.variantKey === v.key);
    const keys = [v.key, ...(idx.variantByKey.has(`${v.key}.g2`) ? [`${v.key}.g2`] : [])];
    try {
      await Promise.all(
        keys.map((k) =>
          set.mutateAsync({
            variantKey: k,
            released: prev?.released ?? null,
            label: prev?.label ?? null,
            genders,
            shinyReleased: prev?.shinyReleased ?? null,
            noEvolve: prev?.noEvolve ?? null,
            noMega: prev?.noMega ?? null,
            kind: prev?.kind ?? null,
            hidden: prev?.hidden ?? null,
          }),
        ),
      );
      toast(t.saved);
    } catch {
      toast(t.err_generic);
    }
  };

  return (
    <section className="card p-3">
      <h2 className="font-bold">{t.genders_review_title} <span className="tnum font-normal text-ink-3">{todo.length}</span></h2>
      <p className="mt-0.5 text-xs text-ink-3">{t.genders_review_hint}</p>
      <ul className="mt-2 divide-y divide-line">
        {todo.map((v) => {
          const sp = idx.speciesByDex.get(v.dex);
          return (
            <li key={v.key} className="flex flex-wrap items-center gap-2 py-2">
              <Sprite idx={idx} variant={v} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{localized(sp?.name, lang)}</span>
                <span className="block truncate text-xs text-ink-2">{localized(v.label, lang)}{v.datamined ? ` · ${t.datamined}` : ''}</span>
              </span>
              <span className="flex flex-wrap gap-1">
                {CHOICES.map(([label, g]) => (
                  <Chip key={label} className="min-h-8 px-2 text-xs" disabled={set.isPending} onClick={() => confirm(v, g)}>{t[label as 'genders_mf']}</Chip>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
