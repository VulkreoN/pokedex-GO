import { useEffect, useRef, useState } from 'react';
import type { Gender, Variant, VariantKind } from '@mydexpogo/shared';
import type { VariantGroup } from './AddToList.js';
import { useOverrides, useSetOverride, type OverrideLabelInput } from '../lib/admin.js';
import type { DatasetIndex } from '../lib/dataset.js';
import { localized, useLang, useT } from '../lib/i18n.js';
import { Sparkle, Sprite } from './Sprite.js';
import { useToast } from './toast.js';
import { Badge, Button, Chip, HoldButton, Sheet, TextField } from './ui.js';

/** The categories of the Pokédex, in its order. */
export const VARIANT_KINDS: VariantKind[] = ['base', 'costume', 'form', 'regional', 'mega', 'gmax'];

export interface ReclassifyPreset {
  id: string;
  kind: VariantKind;
  label: { en: string; fr: string };
  chipFr: string;
  chipEn: string;
}

/** One-tap reclassification presets (sets both category and canonical FR/EN form label). */
export const RECLASSIFY_PRESETS: readonly ReclassifyPreset[] = [
  { id: 'alola', kind: 'regional', label: { en: 'Alola', fr: "d'Alola" }, chipFr: 'Alola', chipEn: 'Alola' },
  { id: 'galar', kind: 'regional', label: { en: 'Galarian', fr: 'de Galar' }, chipFr: 'Galar', chipEn: 'Galar' },
  { id: 'hisui', kind: 'regional', label: { en: 'Hisuian', fr: 'de Hisui' }, chipFr: 'Hisui', chipEn: 'Hisui' },
  { id: 'paldea', kind: 'regional', label: { en: 'Paldea', fr: 'de Paldea' }, chipFr: 'Paldea', chipEn: 'Paldea' },
  { id: 'gmax', kind: 'gmax', label: { en: 'Gigantamax', fr: 'Gigamax' }, chipFr: 'Gigamax', chipEn: 'Gigantamax' },
  { id: 'mega', kind: 'mega', label: { en: 'Mega', fr: 'Méga' }, chipFr: 'Méga', chipEn: 'Mega' },
  { id: 'mega_x', kind: 'mega', label: { en: 'Mega X', fr: 'Méga X' }, chipFr: 'Méga X', chipEn: 'Mega X' },
  { id: 'mega_y', kind: 'mega', label: { en: 'Mega Y', fr: 'Méga Y' }, chipFr: 'Méga Y', chipEn: 'Mega Y' },
  { id: 'mega_z', kind: 'mega', label: { en: 'Mega Z', fr: 'Méga Z' }, chipFr: 'Méga Z', chipEn: 'Mega Z' },
];

type NameMode = 'keep' | 'custom' | 'reset';

/** Manager tools for one form/costume: reclassify category/region, edit display names, toggle release/shiny/genders/flags, or hide. */
export function ManagerSheet({ idx, group, onClose }: { idx?: DatasetIndex; group: VariantGroup | null; onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const set = useSetOverride();
  const overrides = useOverrides(!!group);
  const [released, setReleased] = useState<boolean | null>(null);
  const [genders, setGenders] = useState<'auto' | 'mf' | 'm' | 'f' | 'none'>('auto');
  const [shinyOut, setShinyOut] = useState<boolean | null>(null);
  const [noEvolve, setNoEvolve] = useState<boolean | null>(null);
  const [noMega, setNoMega] = useState<boolean | null>(null);
  const [kind, setKind] = useState<VariantKind | null>(null);
  const [en, setEn] = useState('');
  const [fr, setFr] = useState('');
  const [nameMode, setNameMode] = useState<NameMode>('keep');
  const initRef = useRef<{ key: string; withOverrides: boolean } | null>(null);

  const primary: Variant | undefined = group?.variants[0];
  const existing = primary ? overrides.data?.find((x) => x.variantKey === primary.key) : undefined;
  const autoMeta = existing?.meta;
  const autoKind: VariantKind = autoMeta?.kind ?? primary?.kind ?? 'base';
  const autoReleased: boolean = autoMeta?.released ?? (primary ? !primary.datamined : true);
  const autoShinyOut: boolean = autoMeta?.shinyReleased ?? (primary ? primary.hasShiny && primary.shinyReleased !== false : false);
  const autoLabel = autoMeta !== undefined ? autoMeta?.label ?? null : existing?.label ? null : group?.label ?? null;

  useEffect(() => {
    if (!group || !primary) {
      initRef.current = null;
      return;
    }
    const key = primary.key;
    const hasData = overrides.isFetched;
    // Hydrate once on open, and at most once more when the overrides query finishes — never clobber user edits on refetches.
    if (initRef.current?.key === key && (initRef.current.withOverrides || !hasData)) return;
    initRef.current = { key, withOverrides: hasData };
    const o = overrides.data?.find((x) => x.variantKey === key);
    const g = o?.genders;
    setGenders(!g ? 'auto' : g.length === 0 ? 'none' : g.length === 2 ? 'mf' : g[0] === 'm' ? 'm' : 'f');
    setReleased(o?.released ?? null);
    setShinyOut(o?.shinyReleased ?? null);
    setNoEvolve(o?.noEvolve ?? null);
    setNoMega(o?.noMega ?? null);
    setKind(o?.kind ?? null);
    setEn(o?.label?.en ?? group.label?.en ?? '');
    setFr(o?.label?.fr ?? group.label?.fr ?? '');
    setNameMode('keep');
  }, [group, primary, overrides.data, overrides.isFetched]);

  const applyPreset = (p: ReclassifyPreset) => {
    setKind(p.kind);
    setEn(p.label.en);
    setFr(p.label.fr);
    setNameMode('custom');
  };

  const resetNameToAuto = () => {
    setEn(autoLabel?.en ?? '');
    setFr(autoLabel?.fr ?? '');
    setNameMode('reset');
  };

  const save = async (mode: boolean | null, nextHidden?: boolean | null) => {
    if (!group || !primary) return;
    const prev = overrides.data?.find((x) => x.variantKey === primary.key);
    let label: OverrideLabelInput = prev?.label ?? null;
    if (nameMode === 'reset') {
      label = null;
    } else if (nameMode === 'custom') {
      const cleanEn = en.trim();
      const cleanFr = fr.trim();
      label = cleanEn || cleanFr ? { ...(cleanEn ? { en: cleanEn } : {}), ...(cleanFr ? { fr: cleanFr } : {}) } : null;
    }
    const g: Gender[] | null = { auto: null, mf: ['m', 'f'] as Gender[], m: ['m'] as Gender[], f: ['f'] as Gender[], none: [] as Gender[] }[genders];
    const hidden = nextHidden !== undefined ? nextHidden : (prev?.hidden ?? null);
    const results = await Promise.all(
      group.variants.map((v) =>
        set.mutateAsync({ variantKey: v.key, released: mode, label, genders: g, shinyReleased: shinyOut, noEvolve, noMega, kind, hidden }),
      ),
    );
    const totalRemoved = results.reduce((sum, r) => sum + (r.removedEntries ?? 0), 0);
    const maxLists = results.reduce((m, r) => Math.max(m, r.updatedLists ?? 0), 0);
    if (nextHidden === true) {
      toast(totalRemoved > 0 ? t.saved_with_sync(t.variant_hidden_done, maxLists, totalRemoved) : t.variant_hidden_done);
    } else {
      toast(totalRemoved > 0 ? t.saved_with_sync(t.saved, maxLists, totalRemoved) : t.saved);
    }
    onClose();
  };

  const species = primary && idx ? idx.speciesByDex.get(primary.dex) : undefined;
  const hasShiny = !!group?.variants.some((v) => v.hasShiny);
  const effectiveKind = kind ?? autoKind;
  const hasCustomName = nameMode === 'custom' || (nameMode === 'keep' && !!existing?.label);
  const autoLabelText = autoLabel ? localized(autoLabel, lang) : '';
  const willSyncCollections = shinyOut === false || released === false;

  const frInput = (
    <TextField
      key="fr"
      label={`${t.label_name} (FR)`}
      placeholder={autoLabel?.fr || autoLabel?.en || t.manage_name_placeholder}
      value={fr}
      onChange={(e) => {
        setFr(e.target.value);
        setNameMode('custom');
      }}
      maxLength={60}
    />
  );
  const enInput = (
    <TextField
      key="en"
      label={`${t.label_name} (EN)`}
      placeholder={autoLabel?.en || t.manage_name_placeholder}
      value={en}
      onChange={(e) => {
        setEn(e.target.value);
        setNameMode('custom');
      }}
      maxLength={60}
    />
  );

  const footer = group && primary ? (
    <Button tone="primary" className="w-full" disabled={set.isPending} onClick={() => save(released)}>
      {t.save}
    </Button>
  ) : undefined;

  return (
    <Sheet open={!!group} onClose={onClose} title={t.manage_variant} footer={footer}>
      {group && primary && (
        <div className="space-y-4">
          {/* Preview card: normal + shiny sprites, species, displayed label, current category & technical keys */}
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper-2/50 p-2.5">
            {idx && (
              <div className="flex shrink-0 items-center gap-1">
                <Sprite idx={idx} variant={primary} size={52} />
                {hasShiny && (
                  <span className="relative">
                    <Sprite idx={idx} variant={primary} shiny size={52} />
                    <Sparkle className="absolute -right-0.5 top-0 text-shiny" />
                  </span>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-bold">{species ? localized(species.name, lang) : `#${primary.dex}`}</span>
                <Badge tone="muted">{t.kinds[effectiveKind]}</Badge>
              </div>
              <p className="truncate text-xs text-ink-2">{localized(group.label, lang) || t.normal}</p>
              <p className="truncate font-mono text-[11px] text-ink-3">{group.variants.map((v) => v.key).join(', ')}</p>
            </div>
          </div>

          {/* 1. Category & 1-tap reclassification presets (Alola, Galar, Hisui, Paldea, Gigamax, Méga…) */}
          <div className="space-y-2 rounded-2xl border border-line p-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-2">{t.kind_status}</p>
              <div className="flex flex-wrap gap-1.5">
                {VARIANT_KINDS.map((k) => (
                  <Chip key={k} active={kind === k} onClick={() => setKind(k)} className="min-h-8 px-2.5 text-xs">
                    {t.kinds[k]}
                  </Chip>
                ))}
                <Chip active={kind === null} onClick={() => setKind(null)} className="min-h-8 px-2.5 text-xs">
                  {t.mark_auto} ({t.kinds[autoKind]})
                </Chip>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-ink-3">{t.manage_reclassify}</p>
              <div className="flex flex-wrap gap-1.5">
                {RECLASSIFY_PRESETS.map((p) => {
                  const active = kind === p.kind && fr.trim().toLowerCase() === p.label.fr.toLowerCase() && en.trim().toLowerCase() === p.label.en.toLowerCase();
                  return (
                    <Chip key={p.id} active={active} onClick={() => applyPreset(p)} className="min-h-7 px-2 text-xs">
                      {lang === 'fr' ? p.chipFr : p.chipEn}
                    </Chip>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Display name (current language first, FR-only allowed, 1-tap reset to automatic) */}
          <div className="space-y-2.5 rounded-2xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink-2">{t.label_name}</p>
              {hasCustomName && (
                <button type="button" onClick={resetNameToAuto} className="text-xs font-semibold text-sky hover:underline">
                  {t.manage_name_reset}
                </button>
              )}
            </div>
            {autoLabelText && (
              <p className="text-[11px] text-ink-3">{t.manage_name_auto_hint(autoLabelText)}</p>
            )}
            {lang === 'fr' ? (
              <>
                {frInput}
                {enInput}
              </>
            ) : (
              <>
                {enInput}
                {frInput}
              </>
            )}
          </div>

          {/* 3. Release & shiny availability */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">
              {t.release_status} · <span className="font-normal">auto{lang === 'fr' ? ' : ' : ': '}{autoReleased ? t.mark_released : t.mark_unreleased}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={released === true} onClick={() => setReleased(true)}>{t.mark_released}</Chip>
              <Chip active={released === false} onClick={() => setReleased(false)}>{t.mark_unreleased}</Chip>
              <Chip active={released === null} onClick={() => setReleased(null)}>{t.mark_auto}</Chip>
            </div>
          </div>
          {hasShiny && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-3">
                {t.shiny_status} · <span className="font-normal">auto{lang === 'fr' ? ' : ' : ': '}{autoShinyOut ? t.shiny_out : t.shiny_not_out}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={shinyOut === true} onClick={() => setShinyOut(true)}>{t.shiny_out}</Chip>
                <Chip active={shinyOut === false} onClick={() => setShinyOut(false)}>{t.shiny_not_out}</Chip>
                <Chip active={shinyOut === null} onClick={() => setShinyOut(null)}>{t.mark_auto}</Chip>
              </div>
            </div>
          )}
          {willSyncCollections && (
            <p className="rounded-xl bg-sky/10 px-3 py-2 text-xs text-ink-2">{t.manage_collection_sync_hint}</p>
          )}

          {/* 4. Genders, Evolution & Mega flags */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.genders_title}</p>
            <div className="flex flex-wrap gap-1.5">
              {(['auto', 'mf', 'm', 'f', 'none'] as const).map((k) => (
                <Chip key={k} active={genders === k} onClick={() => setGenders(k)}>{t[`genders_${k}`]}</Chip>
              ))}
            </div>
            {primary.gendersGuessed && genders === 'auto' && <p className="mt-1 text-xs text-ink-3">{t.genders_guessed}</p>}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.evolve_status}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={noEvolve === false} onClick={() => setNoEvolve(false)}>{t.evolve_yes}</Chip>
              <Chip active={noEvolve === true} onClick={() => setNoEvolve(true)}>{t.no_evolve}</Chip>
              <Chip active={noEvolve === null} onClick={() => setNoEvolve(null)}>{t.mark_auto}</Chip>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-3">{t.mega_status}</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={noMega === false} onClick={() => setNoMega(false)}>{t.mega_yes}</Chip>
              <Chip active={noMega === true} onClick={() => setNoMega(true)}>{t.no_mega}</Chip>
              <Chip active={noMega === null} onClick={() => setNoMega(null)}>{t.mark_auto}</Chip>
            </div>
          </div>

          <p className="text-xs text-ink-3">{t.manage_hint}</p>

          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs font-medium text-berry">{t.variant_hide}</p>
            <p className="text-xs text-ink-3">{t.variant_hide_hint}</p>
            <HoldButton className="w-full" disabled={set.isPending} onConfirm={() => save(released, true)}>
              {t.variant_hide_confirm}
            </HoldButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}
