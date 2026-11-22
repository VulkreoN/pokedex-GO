import { typeName, useLang } from '../lib/i18n.js';

export const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', grass: '#7ac74c', electric: '#f7d02c', ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1',
  ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a', rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
};

export function TypeBadge({ type, small = false }: { type: string; small?: boolean }) {
  const { lang } = useLang();
  return (
    <span className={`rounded-md font-bold text-white ${small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`} style={{ background: TYPE_COLORS[type] ?? '#888' }}>
      {typeName(type, lang)}
    </span>
  );
}
