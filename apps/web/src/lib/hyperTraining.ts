/**
 * Hyper Training (Bottle Caps): the task that raises a stat to each IV value, from 1 to 15.
 * Task list from g47ix (https://g47ix.pro/bottlecap/), French wording ours.
 */
export type HtStat = 'atk' | 'def' | 'sta';

const en: Record<HtStat, string[]> = {
  atk: [
    'Battle in a Gym with your trainee in your battle party',
    'Battle a Team GO Rocket member with your trainee in your battle party',
    'Battle in a raid with your trainee in your battle party',
    'Win 2 Gym battles with your trainee in your battle party',
    'Defeat 2 Team GO Rocket members with your trainee in your battle party',
    'Win 5 raids with your trainee in your battle party',
    'Win 20 Gym battles with your trainee in your battle party',
    'Win 10 raids with your trainee in your battle party',
    'Defeat 15 Team GO Rocket members with your trainee in your battle party',
    'Defeat a Team GO Rocket Leader 2 times with your trainee in your battle party',
    'Win 20 raids with your trainee in your battle party',
    'Win 40 Gym battles with your trainee in your battle party',
    'Defeat 40 Team GO Rocket members with your trainee in your battle party',
    'Defeat a Team GO Rocket Leader 5 times with your trainee in your battle party',
    'Win 40 raids with your trainee in your battle party',
  ],
  def: [
    'Take a snapshot of your trainee',
    'Play with your trainee as your buddy',
    'Power up a Pokémon that shares a type with your trainee',
    'Catch 15 different species of Pokémon with your trainee as your buddy',
    'Catch 30 Pokémon with your trainee as your buddy',
    'Take a snapshot of your trainee on 7 different days',
    'Play with your trainee as your buddy on 7 different days',
    'Power up a Pokémon that shares a type with your trainee 15 times',
    'Catch 45 different species of Pokémon with your trainee as your buddy',
    'Catch 150 Pokémon with your trainee as your buddy',
    'Take a snapshot of your trainee on 15 different days',
    'Play with your trainee as your buddy on 15 different days',
    'Power up a Pokémon that shares a type with your trainee 30 times',
    'Catch 60 different species of Pokémon with your trainee as your buddy',
    'Catch 1500 Pokémon with your trainee as your buddy',
  ],
  sta: [
    'Spin a PokéStop or Gym with your trainee as your buddy',
    'Earn a Candy exploring with your trainee as your buddy',
    'Complete a Field Research task with your trainee as your buddy',
    'Hatch an Egg with your trainee as your buddy',
    'Explore 1 km with your trainee as your buddy',
    'Spin 40 PokéStops or Gyms with your trainee as your buddy',
    'Earn 3 Candies exploring with your trainee as your buddy',
    'Complete 30 Field Research tasks with your trainee as your buddy',
    'Hatch 15 Eggs with your trainee as your buddy',
    'Earn 4 Candies exploring with your trainee as your buddy',
    'Spin 75 PokéStops or Gyms with your trainee as your buddy',
    'Earn 5 Candies exploring with your trainee as your buddy',
    'Complete 45 Field Research tasks with your trainee as your buddy',
    'Hatch 30 Eggs with your trainee as your buddy',
    'Explore 75 km and earn 10 Candies exploring with your trainee as your buddy',
  ],
};

const fr: Record<HtStat, string[]> = {
  atk: [
    'Combattre dans une Arène avec le Pokémon dans ton équipe',
    'Affronter un membre de la Team GO Rocket avec le Pokémon dans ton équipe',
    'Participer à un raid avec le Pokémon dans ton équipe',
    "Gagner 2 combats d'Arène avec le Pokémon dans ton équipe",
    'Vaincre 2 membres de la Team GO Rocket avec le Pokémon dans ton équipe',
    'Gagner 5 raids avec le Pokémon dans ton équipe',
    "Gagner 20 combats d'Arène avec le Pokémon dans ton équipe",
    'Gagner 10 raids avec le Pokémon dans ton équipe',
    'Vaincre 15 membres de la Team GO Rocket avec le Pokémon dans ton équipe',
    'Vaincre 2 fois un Chef de la Team GO Rocket avec le Pokémon dans ton équipe',
    'Gagner 20 raids avec le Pokémon dans ton équipe',
    "Gagner 40 combats d'Arène avec le Pokémon dans ton équipe",
    'Vaincre 40 membres de la Team GO Rocket avec le Pokémon dans ton équipe',
    'Vaincre 5 fois un Chef de la Team GO Rocket avec le Pokémon dans ton équipe',
    'Gagner 40 raids avec le Pokémon dans ton équipe',
  ],
  def: [
    'Prendre une photo du Pokémon',
    'Jouer avec le Pokémon en copain',
    'Améliorer un Pokémon qui partage un type avec lui',
    "Attraper 15 espèces différentes avec lui en copain",
    'Attraper 30 Pokémon avec lui en copain',
    'Prendre une photo du Pokémon 7 jours différents',
    'Jouer avec lui en copain 7 jours différents',
    'Améliorer 15 fois un Pokémon qui partage un type avec lui',
    'Attraper 45 espèces différentes avec lui en copain',
    'Attraper 150 Pokémon avec lui en copain',
    'Prendre une photo du Pokémon 15 jours différents',
    'Jouer avec lui en copain 15 jours différents',
    'Améliorer 30 fois un Pokémon qui partage un type avec lui',
    'Attraper 60 espèces différentes avec lui en copain',
    'Attraper 1 500 Pokémon avec lui en copain',
  ],
  sta: [
    'Faire tourner un PokéStop ou une Arène avec lui en copain',
    'Gagner un Bonbon en explorant avec lui en copain',
    "Terminer une Étude de terrain avec lui en copain",
    'Faire éclore un Œuf avec lui en copain',
    'Parcourir 1 km avec lui en copain',
    'Faire tourner 40 PokéStops ou Arènes avec lui en copain',
    'Gagner 3 Bonbons en explorant avec lui en copain',
    'Terminer 30 Études de terrain avec lui en copain',
    'Faire éclore 15 Œufs avec lui en copain',
    'Gagner 4 Bonbons en explorant avec lui en copain',
    'Faire tourner 75 PokéStops ou Arènes avec lui en copain',
    'Gagner 5 Bonbons en explorant avec lui en copain',
    'Terminer 45 Études de terrain avec lui en copain',
    'Faire éclore 30 Œufs avec lui en copain',
    'Parcourir 75 km et gagner 10 Bonbons en explorant avec lui en copain',
  ],
};

export const HYPER_TRAINING = { en, fr };

import { keyword, type GameLang } from '@mydexpogo/shared';

/** Pokémon with at least two perfect stats, not already 15/15/15, not shadow (shadows can't be trained). */
export function candidateSearch(shinyOnly: boolean, lang: GameLang = 'en'): string {
  const atk = keyword('attack', lang);
  const def = keyword('defense', lang);
  const hp = keyword('hp', lang);
  const shadow = keyword('shadow', lang);
  const shiny = keyword('shiny', lang);
  return `4${atk},4${def}&4${atk},4${hp}&4${def},4${hp}&!4*&!${shadow}${shinyOnly ? `&${shiny}` : ''}`;
}
