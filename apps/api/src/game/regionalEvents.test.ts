import { describe, expect, it } from 'vitest';
import type { RichGameEvent } from '@mydexpogo/shared';
import {
  mergeRegionalEvents,
  parseCurrentEventsTemplate,
  parseFandomRegionalPage,
  parseSerebiiRealLifeHtml,
  type SpeciesSpriteLookup,
} from './regionalEvents.js';

const NOW = new Date('2026-11-27T12:00:00Z').getTime();
const species: SpeciesSpriteLookup = new Map([
  ['pikachu', { dex: 25, image: 'https://sprites/pm25.icon.png' }],
  ['hoppip', { dex: 187, image: 'https://sprites/pm187.icon.png' }],
  ['clefairy', { dex: 35, image: 'https://sprites/pm35.icon.png' }],
]);

describe('regionalEvents parser', () => {
  it('parses multi-venue Mall Exploration (Malaysia, Philippines, Singapore, Hong Kong, Thailand) line-by-line', () => {
    const ev = parseFandomRegionalPage(
      {
        title: 'Pokémon 30th Anniversary Mall Exploration',
        thumbnail: 'https://static.wikia.nocookie.net/pokemongo/images/mall.jpg',
        categories: ['Category:Regional events', 'Category:Asian events'],
        wikitext: `{{Infobox/Event
 | image      = Pokémon 30th Anniversary Mall Exploration.jpg
 | start-date = Various
 | end-date   = Various
 | location   = Select malls in Malaysia, Philippines, Singapore, Hong Kong, Thailand
}}
'''Pokémon 30th Anniversary Mall Exploration''' was a [[:Category:Regional events|regional]] [[event]] in [[Pokémon GO]].<ref>[https://pokemongo.com/en/news/apac-mall-exploration-2026 Official news].</ref>

* Malaysia
** Ombak KLCC: October {{nth|1}} - December {{Nth|31}}, 2026
* Philippines
** SM Mall of Asia: October {{nth|1}}, 2026 - January {{nth|31}}, 2027
** SM CDO Downtown: March {{nth|13}} - {{nth|28}}, 2027

==Features==
{{BI|Lure|4-hour [[Lure Modules]] duration}}
{{BI|Research|[[Timed Research]] available}}
`,
      },
      species,
      NOW,
    );

    expect(ev).not.toBeNull();
    expect(ev!.eventType).toBe('local-event');
    expect(ev!.start).toBe('2026-10-01T00:00:00.000');
    expect(ev!.end).toBe('2027-03-28T23:59:59.000');
    expect(ev!.location).toContain('Philippines');
    expect(ev!.link).toBe('https://pokemongo.com/en/news/apac-mall-exploration-2026');
    expect(ev!.bonuses.map((b) => b.text)).toEqual(['4-hour Lure Modules duration', 'Timed Research available']);
  });

  it('parses extended end dates (UK National Trust) and raid bosses with Location Backgrounds', () => {
    const ev = parseFandomRegionalPage(
      {
        title: 'National Trust collaboration',
        categories: ['Category:Regional events'],
        wikitext: `{{Infobox/Event
 | title      = Pokémon GO: National Trust
 | start-date = July {{nth|18}}, 2026
 | end-date   = Originally September {{nth|6}}, 2026.
On July {{nth|31}}, 2026 it was announced that the partnership has been extended until December {{nth|31}}, 2026
 | location   = National Trust locations across England, Wales, and Northern Ireland
}}
The '''National Trust collaboration''' was a sponsored regional event.

==Features==
{{BI|General|[[Location Background]]s available}}
{{RB|Hoppip|Grass|Flying|s=t}}
`,
      },
      species,
      NOW,
    );

    expect(ev).not.toBeNull();
    expect(ev!.name).toBe('Pokémon GO: National Trust');
    expect(ev!.start).toBe('2026-07-18T00:00:00.000');
    expect(ev!.end).toBe('2026-12-31T23:59:59.000');
    expect(ev!.raidGroups[0]?.mons[0]).toEqual({ name: 'Hoppip', image: 'https://sprites/pm187.icon.png', canBeShiny: true });
    expect(ev!.highlights.some((h) => h.kind === 'background')).toBe(true);
  });

  it('keeps permanent/ongoing venues (PokéPark KANTO) and skips redirects, expired, and global events', () => {
    const park = parseFandomRegionalPage(
      {
        title: 'PokéPark KANTO',
        categories: ['Category:Real-world events'],
        wikitext: `{{Infobox/Event
 | start-date = February {{nth|5}}, 2026
 | end-date   = None
 | location   = PokéPark KANTO at the Yomiuriland Amusement Park in Inagi, Tokyo, Japan
}}
'''PokéPark KANTO''' is a permanent regional event in Japan.`,
      },
      species,
      NOW,
    );
    expect(park).not.toBeNull();
    expect(park!.end).toBeNull();

    const redirect = parseFandomRegionalPage(
      { title: 'Red Jet', wikitext: '#REDIRECT [[Pokémon Jet Collaboration Events]]', categories: ['Category:Regional events'] },
      species,
      NOW,
    );
    expect(redirect).toBeNull();

    const expired = parseFandomRegionalPage(
      {
        title: 'Old Event',
        categories: ['Category:Regional events'],
        wikitext: `{{Infobox/Event
 | start-date = March {{nth|1}}, 2026
 | end-date   = March {{nth|5}}, 2026
 | location   = India
}}`,
      },
      species,
      NOW,
    );
    expect(expired).toBeNull();

    const globalEv = parseFandomRegionalPage(
      {
        title: 'Pokémon GO Wild Area 2026: Global',
        categories: ['Category:Real-world events'],
        wikitext: `{{Infobox/Event
 | start-date = November {{nth|25}}, 2026
 | end-date   = November {{nth|30}}, 2026
 | location   = Worldwide
}}`,
      },
      species,
      NOW,
    );
    expect(globalEv).toBeNull();
  });

  it('parses Template:CurrentEvents entries and Serebii Real-Life table', () => {
    const ce = parseCurrentEventsTemplate(
      `{{EI|European Space Agency partnership|Oct|4|Apr|30|European Space Agency.jpg|European Space Agency partnership|y1=2026|y2=2027}}
{{EI|PokéXciting! (Manila, Philippines)|Jan|23|Jan|24|PokéXciting.jpg|PokéXciting!|y1=2027|y2=2027}}`,
      2026,
    );
    expect(ce).toHaveLength(2);
    expect(ce[0]?.page).toBe('European Space Agency partnership');
    expect(ce[1]?.start.getUTCFullYear()).toBe(2027);

    const serebii = parseSerebiiRealLifeHtml(
      `<table>
        <tr><td><img src="/pokemongo/obs.jpg"></td><td><a href="reallifeevents/obs.shtml"><u>Pokemon Astronomical Observatory</u></a></td><td>November 1st 2025 - ???</td><td>Kanagawa, Japan</td></tr>
        <tr><td><img src="/pokemongo/old.jpg"></td><td><a href="reallifeevents/old.shtml"><u>Old Festival</u></a></td><td>March 4th - March 8th 2026</td><td>India</td></tr>
      </table>`,
      NOW,
    );
    expect(serebii).toHaveLength(1);
    expect(serebii[0]?.name).toBe('Pokemon Astronomical Observatory');
    expect(serebii[0]?.end).toBeNull();
    expect(serebii[0]?.location).toBe('Kanagawa, Japan');
  });

  it('deduplicates regional events against Leek Duck events while enriching missing locations', () => {
    const stub = (over: Partial<RichGameEvent>): RichGameEvent => ({
      eventID: 'id',
      name: 'Event',
      eventType: 'event',
      heading: 'Event',
      template: 'event',
      link: 'https://example.com',
      image: '',
      start: '2026-11-20T00:00:00.000',
      end: '2026-12-20T00:00:00.000',
      summary: null,
      bonuses: [],
      highlights: [],
      featured: [],
      spawnGroups: [],
      raidGroups: [],
      eggGroups: [],
      research: [],
      researchNote: null,
      rocket: [],
      newShinies: [],
      moves: [],
      ...over,
    });

    const base = [stub({ eventID: 'ld-esa', name: 'European Space Agency partnership' })];
    const reg = [
      stub({ eventID: 'serebii-esa', name: 'Pokemon GO x ESA', location: 'London, Toulouse', eventType: 'local-event' }),
      stub({ eventID: 'regional-mall', name: 'Pokémon 30th Anniversary Mall Exploration', location: 'Philippines', eventType: 'local-event' }),
    ];
    const merged = mergeRegionalEvents(base, reg);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.location).toBe('London, Toulouse');
    expect(merged[1]?.eventID).toBe('regional-mall');
  });
});
