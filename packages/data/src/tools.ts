/**
 * The Tools tab's data, from the game master: raid / gym / Rocket move numbers, what each form can learn (Elite
 * moves apart), what evolving and Mega Evolving cost, the buddy distance. Served apart from the Pokédex.
 */
import { makeVariantKey, type LocalizedText, type PokemonType, type ToolEvolution, type ToolMove, type ToolPokemon, type ToolsData } from '@mydexpogo/shared';

interface Branch {
  evolution?: string;
  form?: string;
  temporaryEvolution?: string;
  temporaryEvolutionEnergyCost?: number;
  temporaryEvolutionEnergyCostSubsequent?: number;
  candyCost?: number;
  candyCostPurified?: number;
  evolutionItemRequirement?: string;
  lureItemRequirement?: string;
  noCandyCostViaTrade?: boolean;
  kmBuddyDistanceRequirement?: number;
  onlyDaytime?: boolean;
  onlyNighttime?: boolean;
  onlyFullMoon?: boolean;
  onlyDuskPeriod?: boolean;
  onlyUpsideDown?: boolean;
  genderRequirement?: string;
  evolutionItemRequirementCost?: number;
  evolutionMoveRequirement?: string;
  evolutionLikelihoodWeight?: number;
  questDisplay?: { questRequirementTemplateId?: string }[];
}
interface GmEntry {
  templateId: string;
  data: {
    moveSettings?: { movementId: string | number; pokemonType?: string; power?: number; durationMs?: number; energyDelta?: number };
    pokemonSettings?: {
      pokemonId: string;
      form?: string;
      type?: string;
      type2?: string;
      stats?: { baseAttack?: number; baseDefense?: number; baseStamina?: number };
      quickMoves?: (string | number)[];
      cinematicMoves?: (string | number)[];
      eliteQuickMove?: (string | number)[];
      eliteCinematicMove?: (string | number)[];
      nonTmCinematicMoves?: (string | number)[];
      formChange?: { availableForm?: string[]; moveReassignment?: { quickMoves?: { replacementMoves?: (string | number)[] }[]; cinematicMoves?: { replacementMoves?: (string | number)[] }[] } }[];
      kmBuddyDistance?: number;
      evolutionBranch?: Branch[];
      thirdMove?: { stardustToUnlock?: number; candyToUnlock?: number };
      shadow?: { purificationStardustNeeded?: number };
      tempEvoOverrides?: { tempEvoId?: string; stats?: { baseAttack?: number; baseDefense?: number; baseStamina?: number }; typeOverride1?: string; typeOverride2?: string }[];
    };
  };
}

export interface ToolsContext {
  isCostume: (dex: number, token: string) => boolean;
  released: (dex: number) => boolean;
  /** Whether a specific non-Mega form is released in the game (excludes battle-only & datamined forms). */
  formReleased?: (dex: number, key: string) => boolean;
  /** Whether this Mega / Primal is in the game (not one of the upcoming ones). */
  megaReleased: (key: string) => boolean;
  name: (dex: number, token: string | null) => LocalizedText;
  dexOf: (pokemonId: string) => number | undefined;
  text: (key: string) => LocalizedText | undefined;
  /** A move's name from the game texts, by the number of its template ("0590"). */
  moveText: (num: string) => LocalizedText | undefined;
  /** An evolution task's goal in the game's words ("Defeat 30 Ghost- or Psychic-type Pokémon"). */
  questText: (templateId: string) => LocalizedText | undefined;
}

/** "GLAIVE_RUSH" -> "Glaive Rush", for a move the texts do not name yet. */
const humanize = (token: string) => token.toLowerCase().replace(/_fast$/, '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Eevee's nickname trick: once per nickname, the same in every language. */
const EEVEE_NICKNAMES: Record<string, string> = { '134': 'Rainer', '135': 'Sparky', '136': 'Pyro', '196': 'Sakura', '197': 'Tamao', '470': 'Linnea', '471': 'Rea', '700': 'Kira' };
const TYROGUE: Record<string, 'atk' | 'def' | 'sta'> = { '106': 'atk', '107': 'def', '237': 'sta' };
/** Signature / Adventure Effect moves Niantic keeps off pokemonSettings so Elite TMs cannot teach them. */
const EXTRA_SIGNATURE_MOVES: Record<string, string[]> = {
  '249.fS': ['AEROBLAST_PLUS', 'AEROBLAST_PLUS_PLUS'],
  '250.fS': ['SACRED_FIRE_PLUS', 'SACRED_FIRE_PLUS_PLUS'],
  '483.fORIGIN': ['ROAR_OF_TIME'],
  '484.fORIGIN': ['SPACIAL_REND'],
  '647.fRESOLUTE': ['SECRET_SWORD'],
};
/** Alternate forms whose Game Master template carries a copied `shadow` block even though their Shadow is not out. */
const UNRELEASED_SHADOW_FORMS = new Set([
  '144.fGALARIAN', '145.fGALARIAN', '146.fGALARIAN',
  '150.fA',
  '249.fS', '250.fS',
  '483.fORIGIN', '484.fORIGIN', '487.fORIGIN',
  '554.fGALARIAN', '555.fGALARIAN_STANDARD',
  '641.fTHERIAN', '642.fTHERIAN', '645.fTHERIAN',
]);
/** Legacy "_S" shadow-template placeholders in the game master (only Apex Lugia/Ho-Oh are distinct forms). */
const APEX_FORMS = new Set(['249.fS', '250.fS']);

const typeOf = (t?: string) => (t ? (t.replace('POKEMON_TYPE_', '').toLowerCase() as PokemonType) : null);
const tokenOf = (pokemonId: string, form?: string) => {
  if (!form) return null;
  const t = form.startsWith(`${pokemonId}_`) ? form.slice(pokemonId.length + 1) : form;
  return t === 'NORMAL' ? null : t;
};

export function extractTools(gm: GmEntry[], ctx: ToolsContext, version: string): ToolsData {
  const moves: Record<string, ToolMove> = {};
  const moveNames: Record<string, LocalizedText> = {};
  for (const t of gm) {
    const ms = t.data.moveSettings;
    const type = typeOf(ms?.pokemonType);
    // Mega-only signature moves ("VM_MOVE_TEMP_EVOLUTION_…") are left out.
    const m = /^V(\d{4})_MOVE_(.+)$/.exec(t.templateId);
    if (!ms || !type || !ms.durationMs || !m) continue;
    const id = String(ms.movementId);
    moves[id] = { type, power: ms.power ?? 0, duration: ms.durationMs, energy: Math.abs(ms.energyDelta ?? 0) };
    // Recent moves only have a number as id ("590"): the texts, or the template's name, name them.
    const name = ctx.text(id) ?? ctx.moveText(m[1]!) ?? { en: humanize(m[2]!) };
    moveNames[id] = name;
  }

  // Collect form-change signature moves (Fusion / Crowned forms: Moongeist Beam, Sunsteel Strike, Freeze Shock, Ice Burn, Behemoth Blade/Bash).
  const formChangeMoves = new Map<string, { quick: string[]; charged: string[] }>();
  for (const t of gm) {
    const ps = t.data.pokemonSettings;
    if (!ps?.formChange?.length) continue;
    for (const fc of ps.formChange) {
      if (!fc.moveReassignment || !fc.availableForm?.length) continue;
      const qAdd = (fc.moveReassignment.quickMoves ?? []).flatMap((r) => r.replacementMoves ?? []).map(String).filter((id) => moves[id]);
      const cAdd = (fc.moveReassignment.cinematicMoves ?? []).flatMap((r) => r.replacementMoves ?? []).map(String).filter((id) => moves[id]);
      if (!qAdd.length && !cAdd.length) continue;
      for (const targetForm of fc.availableForm) {
        // Skip reversion entries back to base forms (e.g. Crowned -> Hero reverts Behemoth Blade back to Iron Head).
        if (targetForm.endsWith('_NORMAL') || targetForm.endsWith('_HERO')) continue;
        const k = `${ps.pokemonId}|${targetForm}`;
        const bucket = formChangeMoves.get(k) ?? formChangeMoves.set(k, { quick: [], charged: [] }).get(k)!;
        bucket.quick.push(...qAdd);
        bucket.charged.push(...cAdd);
      }
    }
  }

  // One entry per form; the formless template only when no "_NORMAL" one says the same.
  const pokemon = new Map<string, ToolPokemon>();
  const keyOf = new Map<string, string>(); // `${pokemonId}|${form}` -> key
  const branchesOf = new Map<string, Branch[]>();
  const templates = gm
    .map((t) => ({ m: /^V(\d{4})_POKEMON_/.exec(t.templateId), ps: t.data.pokemonSettings }))
    .filter((x): x is { m: RegExpExecArray; ps: NonNullable<GmEntry['data']['pokemonSettings']> } => !!x.m && !!x.ps?.stats?.baseAttack)
    .sort((a, b) => (a.ps.form?.endsWith('_NORMAL') ? 0 : 1) - (b.ps.form?.endsWith('_NORMAL') ? 0 : 1));
  for (const { m, ps } of templates) {
    const dex = Number(m[1]);
    const token = tokenOf(ps.pokemonId, ps.form);
    if (token && (ctx.isCostume(dex, token) || /COPY|_\d{4}$|^\d{4}$/.test(token))) continue;
    const key = makeVariantKey({ dex, form: token, costume: null, gender: null });
    // Raid-boss-only forms (Eternamax) and internal "_S" shadow templates (except Apex Lugia/Ho-Oh).
    if (token === 'ETERNAMAX' || (token === 'S' && !APEX_FORMS.has(key))) continue;
    keyOf.set(`${ps.pokemonId}|${ps.form ?? ''}`, key);
    if (!ps.form) keyOf.set(`${ps.pokemonId}|${ps.pokemonId}_NORMAL`, key);
    if (pokemon.has(key)) continue;
    const s = ps.stats!;
    const types = [typeOf(ps.type), typeOf(ps.type2)].filter((x): x is PokemonType => !!x);
    // Recent moves are numbers in the game master ("590"): ids are strings everywhere here.
    const ids = (list?: (string | number)[]) => (list ?? []).map(String).filter((id) => moves[id]);
    const fc = ps.form ? formChangeMoves.get(`${ps.pokemonId}|${ps.form}`) : undefined;
    const extraSig = ids(EXTRA_SIGNATURE_MOVES[key]);
    const nonTm = ids(ps.nonTmCinematicMoves);
    const elite = [...ids(ps.eliteQuickMove), ...ids(ps.eliteCinematicMove), ...nonTm, ...(fc?.quick ?? []), ...(fc?.charged ?? []), ...extraSig];
    const quick = [...ids(ps.quickMoves), ...ids(ps.eliteQuickMove), ...(fc?.quick ?? [])];
    const charged = [...ids(ps.cinematicMoves), ...ids(ps.eliteCinematicMove), ...nonTm, ...(fc?.charged ?? []), ...extraSig];
    const released = ctx.formReleased ? ctx.formReleased(dex, key) : ctx.released(dex);
    const p: ToolPokemon = { key, dex, name: ctx.name(dex, token), types, atk: s.baseAttack!, def: s.baseDefense ?? 0, sta: s.baseStamina ?? 0, released, quick: [...new Set(quick)], charged: [...new Set(charged)] };
    if (elite.length) p.elite = [...new Set(elite)];
    if (ps.shadow && !UNRELEASED_SHADOW_FORMS.has(key)) p.shadow = true;
    if (ps.kmBuddyDistance) p.buddyKm = ps.kmBuddyDistance;
    if (ps.thirdMove?.stardustToUnlock) p.secondMove = [ps.thirdMove.stardustToUnlock, ps.thirdMove.candyToUnlock ?? 0];
    if (ps.evolutionBranch?.length) branchesOf.set(key, ps.evolutionBranch);
    pokemon.set(key, p);
    // Megas and Primals fight with their own stats and types, and the moves of the plain form.
    for (const evo of ps.tempEvoOverrides ?? []) {
      const id = evo.tempEvoId?.replace('TEMP_EVOLUTION_', '');
      if (!id || !evo.stats?.baseAttack || token) continue;
      const megaKey = makeVariantKey({ dex, form: id, costume: null, gender: null });
      // "Mega Charizard X" / "Méga-Dracaufeu X", "Primal Kyogre" / "Primo-Kyogre".
      const base = ctx.name(dex, null);
      const suffix = id.startsWith('MEGA_') ? ` ${id.slice(5)}` : '';
      const name = id === 'PRIMAL' ? { en: `Primal ${base.en}`, fr: `Primo-${base.fr ?? base.en}` } : { en: `Mega ${base.en}${suffix}`, fr: `Méga-${base.fr ?? base.en}${suffix}` };
      pokemon.set(megaKey, {
        ...p,
        key: megaKey,
        name,
        types: [typeOf(evo.typeOverride1), typeOf(evo.typeOverride2)].filter((x): x is PokemonType => !!x),
        atk: evo.stats.baseAttack,
        def: evo.stats.baseDefense ?? p.def,
        sta: evo.stats.baseStamina ?? p.sta,
        released: ctx.released(dex) && ctx.megaReleased(megaKey),
        mega: true,
        shadow: undefined,
        evolutions: undefined,
        megaEnergy: undefined,
      });
    }
  }

  const items = new Set<string>();
  for (const [key, branches] of branchesOf) {
    const p = pokemon.get(key)!;
    const evolutions: ToolEvolution[] = [];
    for (const b of branches) {
      if (b.temporaryEvolution) {
        if (b.temporaryEvolutionEnergyCost) p.megaEnergy ??= [b.temporaryEvolutionEnergyCost, b.temporaryEvolutionEnergyCostSubsequent ?? b.temporaryEvolutionEnergyCost];
        if (b.evolutionMoveRequirement) p.megaMove = String(b.evolutionMoveRequirement);
        continue;
      }
      const to = b.evolution && (keyOf.get(`${b.evolution}|${b.form ?? ''}`) ?? keyOf.get(`${b.evolution}|`));
      if (!to || to === key) continue;
      const e: ToolEvolution = { to };
      if (b.candyCost) e.candy = b.candyCost;
      if (b.candyCostPurified && b.candyCostPurified !== b.candyCost) e.candyPurified = b.candyCostPurified;
      if (b.evolutionItemRequirement) items.add((e.item = b.evolutionItemRequirement));
      if (b.lureItemRequirement) items.add((e.lure = b.lureItemRequirement));
      if (b.noCandyCostViaTrade) e.tradeFree = true;
      if (b.kmBuddyDistanceRequirement) e.buddyKm = b.kmBuddyDistanceRequirement;
      if (b.onlyDaytime) e.daytime = true;
      if (b.onlyNighttime) e.nighttime = true;
      if (b.questDisplay?.length) {
        e.quest = true;
        // The everyday task, not a Community Day or event variant of it.
        const ids = b.questDisplay.map((q) => q.questRequirementTemplateId).filter((x): x is string => !!x);
        const id = ids.find((x) => !/_CD_|BUDDY_EVENT/.test(x)) ?? ids[0];
        const text = id && ctx.questText(id);
        if (text) e.questText = text;
      }
      if (b.onlyFullMoon) e.fullMoon = true;
      if (b.onlyDuskPeriod) e.dusk = true;
      if (b.onlyUpsideDown) e.upsideDown = true;
      if (b.genderRequirement === 'MALE') e.gender = 'm';
      if (b.genderRequirement === 'FEMALE') e.gender = 'f';
      if (b.evolutionItemRequirementCost && b.evolutionItemRequirementCost > 1) e.itemCount = b.evolutionItemRequirementCost;
      if (b.evolutionLikelihoodWeight) e.random = true;
      if (!evolutions.some((x) => x.to === e.to)) evolutions.push(e);
    }
    // Several branches with only candy (Eevee's first three, Wurmple, Toxel): the game picks one at random; Tyrogue
    // by its highest stat.
    const plain = evolutions.filter((e) => Object.keys(e).every((k) => k === 'to' || k === 'candy' || k === 'candyPurified'));
    if (plain.length > 1) {
      if (p.dex === 236) for (const e of plain) e.byStat = TYROGUE[e.to] ?? undefined;
      else for (const e of plain) e.random = true;
    }
    if (p.dex === 133) for (const e of evolutions) if (EEVEE_NICKNAMES[e.to]) e.nickname = EEVEE_NICKNAMES[e.to];
    if (evolutions.length) p.evolutions = evolutions;
  }

  const itemNames: Record<string, LocalizedText> = {};
  for (const id of items) {
    const name = ctx.text(id);
    if (name) itemNames[id] = name;
  }
  return { version, moves, moveNames, items: itemNames, pokemon: [...pokemon.values()].sort((a, b) => a.dex - b.dex || a.key.localeCompare(b.key)) };
}
