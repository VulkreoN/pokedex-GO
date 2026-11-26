import { typeName, useLang } from '../lib/i18n.js';

export const TYPE_COLORS: Record<string, string> = {
  normal: '#a8a77a', fire: '#ee8130', water: '#2f6ee0', grass: '#7ac74c', electric: '#f7d02c', ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1',
  ground: '#e2bf65', flying: '#a98ff3', psychic: '#c7285c', bug: '#a6b91a', rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#e695bd',
};

/** Types whose canonical fill is light enough to require dark ink for WCAG AA (>= 4.5:1) contrast. */
const DARK_INK_TYPES = new Set(['normal', 'fire', 'grass', 'electric', 'ice', 'ground', 'flying', 'bug', 'rock', 'steel', 'fairy']);

export function TypeBadge({ type, small = false }: { type: string; small?: boolean }) {
  const { lang } = useLang();
  const darkInk = DARK_INK_TYPES.has(type);
  return (
    <span
      className={`rounded-md font-bold ${small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}
      style={{ background: TYPE_COLORS[type] ?? '#50646e', color: darkInk ? '#1c2a30' : '#ffffff' }}
    >
      {typeName(type, lang)}
    </span>
  );
}
