import { describe, expect, it } from 'vitest';
import { sectionMons } from './eventSpawns.js';

const html = `<h2 id="featured-pokémon">Featured Pokémon</h2><ul class="pkmn-list-flex"><li class="pkmn-list-item"><div class="pkmn-list-img"><img src="https://cdn/pm744.icon.png" alt="Rockruff" /><span class="pokemon-cutout-shiny" role="img"></span></div><div class="pkmn-name">Rockruff</div></li></ul>
<h2 id="spawns" class="event-section-header spawns">Spawns</h2><ul><li class="pkmn-list-item"><img src="https://cdn/pokemon_icon_035_00.png" alt="Clefairy" /><div class="pkmn-name">Clefairy</div></li><li class="pkmn-list-item"><img src="https://cdn/pm605.icon.png" alt="Elgyem" /><span class="pokemon-cutout-shiny"></span><div class="pkmn-name">Elgyem</div></li></ul><h2 id="field-research">Research</h2><li class="pkmn-list-item"><img src="https://cdn/x.png" /><div class="pkmn-name">Not a spawn</div></li>`;

describe('event spawns from a Leek Duck page', () => {
  it('reads one section, up to the next heading, with the shiny badge', () => {
    expect(sectionMons(html, 'spawns')).toEqual([
      { name: 'Clefairy', image: 'https://cdn/pokemon_icon_035_00.png', canBeShiny: false },
      { name: 'Elgyem', image: 'https://cdn/pm605.icon.png', canBeShiny: true },
    ]);
    expect(sectionMons(html, 'featured-pokémon').map((m) => [m.name, m.canBeShiny])).toEqual([['Rockruff', true]]);
    expect(sectionMons(html, 'missing')).toEqual([]);
  });

  it('reads every section whose heading matches: eggs by distance, field research', () => {
    const page = `<h2 id="eggs" class="event-section-header eggs">Eggs</h2><h2 id="in-2-km-eggs">2 km</h2><li class="pkmn-list-item"><img src="https://cdn/pm1.icon.png" /><div class="pkmn-name">Bulbasaur</div></li><h2 id="in-5-km-eggs">5 km</h2><li class="pkmn-list-item"><img src="https://cdn/pm4.icon.png" /><div class="pkmn-name">Charmander</div></li><h2 id="sales">Sales</h2><li class="pkmn-list-item"><img src="https://cdn/pm7.icon.png" /><div class="pkmn-name">Squirtle</div></li>`;
    expect(sectionMons(page, /egg|hatch/).map((m) => m.name)).toEqual(['Bulbasaur', 'Charmander']);
    expect(sectionMons(html, /field-research/).map((m) => m.name)).toEqual(['Not a spawn']);
  });
});
