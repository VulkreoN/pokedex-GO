import { describe, expect, it } from 'vitest';
import {
  bonusFr,
  cupNameFr,
  eventLabelFr,
  eventTextFr,
  eventTitle,
  gblSeasonFr,
  monsFr,
  moveFr,
  promoTextFr,
  researchTaskFr,
  weatherFr,
} from './eventNames.js';

const species = new Map(
  [
    [714, 'Noibat', 'Sonistrelle'], [488, 'Cresselia', 'Cresselia'], [491, 'Darkrai', 'Darkrai'], [641, 'Tornadus', 'Boréas'], [642, 'Thundurus', 'Fulguris'],
    [645, 'Landorus', 'Démétéros'], [354, 'Banette', 'Branette'], [483, 'Dialga', 'Dialga'], [27, 'Sandshrew', 'Sabelette'], [36, 'Clefable', 'Mélodelfe'], [311, 'Plusle', 'Posipi'], [312, 'Minun', 'Négapi'], [818, 'Inteleon', 'Lézargus'],
    [94, 'Gengar', 'Ectoplasma'], [39, 'Jigglypuff', 'Rondoudou'], [25, 'Pikachu', 'Pikachu'],
    [105, 'Marowak', 'Ossatueur'], [376, 'Metagross', 'Métalosse'], [122, 'Mr. Mime', 'M. Mime'],
  ].map(([dex, en, fr]) => [dex as number, { name: { en: en as string, fr: fr as string } }]),
);

describe('event names in French', () => {
  it('weekly kinds', () => {
    expect(eventTitle('Noibat Spotlight Hour', species, 'fr')).toBe('Heure du Pokémon vedette : Sonistrelle');
    expect(eventTitle('Plusle and Minun Spotlight Hour', species, 'fr')).toBe('Heure du Pokémon vedette : Posipi et Négapi');
    expect(eventTitle('Cresselia and Darkrai in 5-star Raid Battles', species, 'fr')).toBe('Cresselia et Darkrai dans les Raids 5 étoiles');
    expect(eventTitle('Mega Banette in Mega Raids', species, 'fr')).toBe('Méga-Branette dans les Méga-Raids');
    expect(eventTitle('Shadow Dialga in Shadow Raids', species, 'fr')).toBe('Dialga obscur dans les Raids obscurs');
    expect(eventTitle('Shadow Tornadus (Incarnate Forme) in Shadow Raids', species, 'fr')).toBe('Boréas (Avatar) obscur dans les Raids obscurs');
    expect(monsFr('Shadow Metagross', species)).toBe('Métalosse obscur');
    expect(monsFr('Shadow Alolan Marowak', species)).toBe("Ossatueur d'Alola obscur");
    expect(monsFr('Shadow Mr. Mime', species)).toBe('M. Mime obscur');
    expect(eventTitle('Tornadus, Thundurus, and Landorus (Therian Formes) in 5-star Raid Battles', species, 'fr')).toBe('Boréas, Fulguris et Démétéros (Totémique) dans les Raids 5 étoiles');
    expect(eventTitle('Dynamax Alolan Sandshrew during Max Monday', species, 'fr')).toBe("Lundi Max : Sabelette d'Alola Dynamax");
    expect(eventTitle('December Community Day 2026', species, 'fr')).toBe('Journée Communauté de décembre 2026');
    expect(eventTitle('January Community Day Classic', species, 'fr')).toBe('Classiques de la Journée Communauté de janvier');
    expect(eventTitle('Clefable Super Mega Raid Day', species, 'fr')).toBe('Super Journée de Méga-Raids : Mélodelfe');
    expect(eventTitle('GO Pass: December', species, 'fr')).toBe('GO Pass : décembre');
    expect(eventTitle('Max Battle Day', species, 'fr')).toBe('Journée Combat Dynamax');
    expect(eventTitle('Gigantamax Inteleon Max Battle Day', species, 'fr')).toBe('Journée Combat Gigamax : Lézargus');
    expect(eventTitle('Hatch Day', species, 'fr')).toBe('Journée Éclosion');
  });
  it('others stay as they are, and English stays English', () => {
    expect(eventTitle('Twilight Wishes', species, 'fr')).toBe('Twilight Wishes');
    expect(eventTitle('Noibat Spotlight Hour', species, 'en')).toBe('Noibat Spotlight Hour');
    expect(monsFr('Dialga', undefined)).toBe('Dialga');
  });

  it('translates recurring Leek Duck bonuses, rewards and section labels into French', () => {
    expect(bonusFr('Max Particle collection limit increased to 1,600', species, 'fr')).toBe('Limite de Particules Max portée à 1 600');
    expect(bonusFr('Up to three Special Trades for the day', species, 'fr')).toBe('Jusqu’à 3 échanges spéciaux par jour');
    expect(bonusFr('Increased chance to encounter Kecleon at PokéStops', species, 'fr')).toBe('Chances accrues de rencontrer Kecleon aux PokéStops');
    expect(bonusFr('GO Pass Deluxe: Receive up to two free Raid Passes per day from spinning Gym Photo Discs', species, 'fr')).toBe('GO Pass Deluxe : Jusqu’à 2 passes de Raid gratuits/jour aux Arènes');
    expect(bonusFr('2× Catch Candy', species, 'fr')).toBe('2× Bonbons de capture');
    expect(bonusFr('1 Max Mushroom', species, 'fr')).toBe('1 Champi Max');
    expect(bonusFr('3 Premium Battle Passes', species, 'fr')).toBe('3 Passes de combat premium');
    expect(bonusFr('2× Hatch Stardust', species, 'fr')).toBe('2× Poussières Étoile d’éclosion');
    expect(bonusFr('Team GO Rocket will appear more frequently at PokéStops and in balloons', species, 'fr')).toBe(
      'Team GO Rocket plus fréquente aux PokéStops et en montgolfière',
    );
    expect(eventLabelFr('Tier 1 – Rank 10', 'fr')).toBe('Palier 1 · Rang 10');
    expect(eventLabelFr('Five-Star Raids*', 'fr')).toBe('Raids 5★');
    expect(eventLabelFr('December 4 to December 7', 'fr')).toBe('4 décembre – 7 décembre');
    expect(eventLabelFr('12:00 a.m. to 5:00 p.m.', 'fr')).toBe('00h00 – 17h00');
    expect(eventTextFr('Gigantamax Inteleon arrives on December 5 from 2:00 p.m. to 5:00 p.m.', species, 'fr')).toBe(
      'Lézargus Gigamax arrive le 5 décembre de 14h00 à 17h00 !',
    );
    expect(eventTextFr('Pokémon from raids may have a Special Background.', species, 'fr')).toBe(
      'Les Pokémon obtenus en raids peuvent avoir un Fond spécial.',
    );
    expect(eventTextFr('Enjoy event-themed raids and Field Research!', species, 'fr')).toContain('Études de terrain');

    const moves = {
      MOONBLAST: { en: 'Moonblast', fr: 'Pouvoir Lunaire' },
      HYDRO_CANNON: { en: 'Hydro Cannon', fr: 'Hydroblast' },
      SHADOW_BALL: { en: 'Shadow Ball', fr: "Ball'Ombre" },
    };
    expect(moveFr('Moonblast+', moves, 'fr')).toBe('Pouvoir Lunaire +');
    expect(eventLabelFr('Moonblast+', 'fr', species, moves)).toBe('Pouvoir Lunaire +');
    expect(eventLabelFr('Mega Clefable Debut', 'fr', species, moves)).toBe('Début de Méga-Mélodelfe');
    expect(eventLabelFr('New Mega Level: Super Max', 'fr', species, moves)).toBe('Nouveau Méga-Niveau : Super Niveau Max');
    expect(eventLabelFr('Super Max', 'fr', species, moves)).toBe('Super Niveau Max');
    expect(
      eventTextFr('Gengar will know the Charged Attack Shadow Ball.', species, 'fr', moves),
    ).toBe("Ectoplasma connaîtra l’Attaque Chargée Ball'Ombre.");
    expect(
      eventTextFr('Mega Clefable, a Fairy- and Flying-type Pokémon, makes its Pokémon GO debut in Super Mega Raids!', species, 'fr', moves),
    ).toBe('Méga-Mélodelfe, un Pokémon de type Fée et Vol, fait ses débuts dans Pokémon GO (Super Méga-Raids) !');
    expect(
      eventTextFr(
        'Mega Clefable makes its Pokémon GO debut during Clefable Super Mega Raid Day on Saturday, November 28, 2026, from 2:00 p.m. to 5:00 p.m. local time!',
        species,
        'fr',
        moves,
      ),
    ).toBe('Méga-Mélodelfe fait ses débuts dans Pokémon GO lors de « Super Journée de Méga-Raids : Mélodelfe » le samedi 28 novembre 2026, de 14h00 à 17h00 (heure locale) !');
    expect(
      eventTextFr(
        'Mega Clefable can reach Super Max Level for the first time. Raise its Mega-Level to Max first, then use Clefable Mega-Energy to reach Super Max. Mega-Evolving alone will not be enough.',
        species,
        'fr',
        moves,
      ),
    ).toBe(
      'Méga-Mélodelfe peut atteindre le Super Niveau Max pour la première fois. Monte d’abord son Méga-Niveau au max, puis utilise de la Méga-Énergie Mélodelfe pour atteindre le Super Niveau Max (les Méga-Raids donnent la Méga-Énergie nécessaire).',
    );
  });

  it('translates weather, promo codes, GBL cups, and field research tasks into natural French', () => {
    expect(weatherFr('Partly Cloudy', 'fr')).toBe('Partiellement nuageux');
    expect(weatherFr('Sunny', 'fr')).toBe('Ensoleillé');
    expect(weatherFr('Sunny', 'en')).toBe('Sunny');

    expect(promoTextFr('adidas Shoes Avatar Item', species, 'fr')).toBe('Objet d’avatar : Chaussures adidas');
    expect(promoTextFr('Pokémon Gengar Classic Clog Avatar Item', species, 'fr')).toBe('Objet d’avatar : Sabots Classic Ectoplasma');
    expect(promoTextFr('Pokémon Jigglypuff Classic Platform Clog Avatar Item', species, 'fr')).toBe('Objet d’avatar : Sabots compensés Classic Rondoudou');
    expect(promoTextFr('10× Poké Ball', species, 'fr')).toBe('10× Poké Ball');
    expect(promoTextFr('2× Incubator', species, 'fr')).toBe('2× Incubateur');

    expect(cupNameFr('Holiday Cup: Great League Edition', 'fr')).toBe('Coupe Fêtes : édition Ligue Super');
    expect(cupNameFr('Little Catch Cup', 'fr')).toBe('Coupe Attrape Jeune');
    expect(cupNameFr('Master Premier', 'fr')).toBe('Ligue Master Premier');
    expect(cupNameFr('Great League: Mega Edition', 'fr')).toBe('Ligue Super : édition Méga');
    expect(eventTitle('Great League and Holiday Cup: Great League Edition | Season 26', species, 'fr')).toBe('Ligue Super · Coupe Fêtes : édition Ligue Super');
    expect(gblSeasonFr('Season 26 Update', 'fr')).toBe('Mise à jour Saison 26');

    expect(researchTaskFr('Catch 5 Grass- or Fairy-type Pokémon', species, 'fr')).toBe('Attrape 5 Pokémon de type Plante ou Fée');
    expect(researchTaskFr('Make 3 Great Curveball Throws in a row', species, 'fr')).toBe('Fais 3 Super lancers à effet à la suite');
    expect(researchTaskFr('Win a three-star raid or higher', species, 'fr')).toBe('Gagne 1 Raid 3★ ou plus');
    expect(researchTaskFr('Defeat 2 Team GO Rocket Grunts', species, 'fr')).toBe('Bats 2 sbires de la Team GO Rocket');
    expect(researchTaskFr('Earn 2 Candies walking with your buddy', species, 'fr')).toBe('Gagne 2 Bonbons en marchant avec ton copain');
    expect(researchTaskFr('Event: Spin 5 PokéStops or Gyms', species, 'fr')).toBe('Événement : Fais tourner 5 PokéStops ou Arènes');
    expect(bonusFr('Deluxe Power up Pokémon 5 times 100 PTS', species, 'fr')).toBe('Deluxe : Recharge un Pokémon 5 fois · 100 PTS');
  });
});
