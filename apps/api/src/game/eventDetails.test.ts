import { describe, expect, it } from 'vitest';
import { parseEventHtml, templateOf } from './eventDetails.js';

const baseEvent = (overrides: Partial<Parameters<typeof parseEventHtml>[1]> = {}) => ({
  eventID: 'test-event',
  name: 'Test Event',
  eventType: 'event',
  heading: 'Event',
  link: 'https://leekduck.com/events/test-event/',
  image: 'https://cdn.leekduck.com/banner.jpg',
  start: '2026-12-01T10:00:00.000',
  end: '2026-12-07T20:00:00.000',
  ...overrides,
});

describe('eventDetails parser', () => {
  it('picks the right visual template for each event type', () => {
    expect(templateOf({ eventType: 'max-battles', name: 'Gigantamax Inteleon Max Battle Day' })).toBe('max');
    expect(templateOf({ eventType: 'community-day', name: 'December Community Day' })).toBe('community_day');
    expect(templateOf({ eventType: 'pokemon-spotlight-hour', name: 'Noibat Spotlight Hour' })).toBe('spotlight');
    expect(templateOf({ eventType: 'raid-day', name: 'Clefable Super Mega Raid Day' })).toBe('raid_day');
    expect(templateOf({ eventType: 'event', name: 'Tropical Paradise' })).toBe('event');
  });

  it('extracts Gigantamax free bonuses, time-window bonuses, paid ticket rewards and new shiny', () => {
    const html = `<div class="event-description">
      <p>Gigantamax Inteleon arrives on December 5 from 2 pm to 5 pm.</p>
      <h2 id="bonuses">Bonuses</h2>
      <div class="bonus-item"><img src="https://cdn/maxparticles.png" /><div class="bonus-text">Max Particle collection limit increased to 1,600</div></div>
      <div class="bonus-item"><img src="https://cdn/trade.png" /><div class="bonus-text">Up to three Special Trades for the day</div></div>
      <p>The following bonuses will be active on December 5, 2026, from 12:00 a.m. to 5:00 p.m. local time.</p>
      <div class="bonus-item"><img src="https://cdn/maxparticle.png" /><div class="bonus-text">2× Max Particles from exploring*</div></div>
      <h2 id="event-ticket">Event Ticket</h2>
      <p>For US$4.99, access Paid Timed Research.</p>
      <ul><li>1 Max Mushroom</li><li>25,000 XP</li><li>6,400 Max Particles</li></ul>
      <div class="bonus-item"><img src="https://cdn/xp.png" /><div class="bonus-text">2× XP from Max Battles</div></div>
      <h2 id="featured-pokémon">Featured Pokémon</h2>
      <li class="pkmn-list-item"><img src="https://cdn/pm818.fGIGANTAMAX.icon.png" /><div class="pkmn-name">Gigantamax Inteleon</div></li>
      <h2 id="shiny">Shiny</h2>
      <p>Shiny Gigantamax Inteleon will be released with the start of the event.</p>
      <li class="pkmn-list-item"><img src="https://cdn/pm818.fGIGANTAMAX.s.icon.png" /><div class="pkmn-name">Gigantamax Inteleon</div></li>
    </div><footer></footer>`;

    const ev = parseEventHtml(html, baseEvent({ eventType: 'max-battles', name: 'Gigantamax Inteleon Max Battle Day' }));
    expect(ev.template).toBe('max');
    expect(ev.bonuses).toHaveLength(3);
    expect(ev.bonuses[0]?.text).toBe('Max Particle collection limit increased to 1,600');
    expect(ev.bonuses[2]?.group).toContain('12:00 a.m. to 5:00 p.m.');
    expect(ev.ticket?.price).toBe('US$4.99');
    expect(ev.ticket?.rewards).toEqual(['1 Max Mushroom', '25,000 XP', '6,400 Max Particles']);
    expect(ev.ticket?.bonuses[0]?.text).toBe('2× XP from Max Battles');
    expect(ev.featured[0]?.newShiny).toBe(true);
    expect(ev.newShinies).toHaveLength(1);
  });

  it('extracts long event GO Pass milestones, tiered raids, dated spawns, debut and special backgrounds', () => {
    const html = `<div class="event-description">
      <p>Pyukumuku makes its Pokémon GO debut in Tropical Paradise!</p>
      <h2 id="bonuses">Bonuses</h2>
      <div class="bonus-item"><img src="https://cdn/pokestop.png" /><div class="bonus-text">Increased chance to encounter Kecleon at PokéStops</div></div>
      <h3 id="tier-1--rank-10">Tier 1 – Rank 10</h3>
      <div class="bonus-item"><img src="https://cdn/xp.png" /><div class="bonus-text">2× Raid XP</div></div>
      <h3 id="tier-2--rank-20">Tier 2 – Rank 20</h3>
      <div class="bonus-item"><img src="https://cdn/pass.png" /><div class="bonus-text">GO Pass Deluxe: Receive up to two free Raid Passes per day from spinning Gym Photo Discs</div></div>
      <h2 id="pokémon-debut">Pokémon Debut</h2>
      <p>Pyukumuku debuts in three-star raids.</p>
      <li class="pkmn-list-item"><img src="https://cdn/pm771.icon.png" /><div class="pkmn-name">Pyukumuku</div></li>
      <h2 id="special-backgrounds">Special Backgrounds</h2>
      <p>Pokémon encountered from raids during the event may have a Special Background.</p>
      <h2 id="spawns">Spawns</h2>
      <li class="pkmn-list-item"><img src="https://cdn/pm143.icon.png" /><span class="shiny-icon"></span><div class="pkmn-name">Snorlax</div></li>
      <h3 id="dec-4-7">December 4 to December 7</h3>
      <li class="pkmn-list-item"><img src="https://cdn/pm285.icon.png" /><div class="pkmn-name">Shroomish</div></li>
      <h2 id="raids">Raids</h2>
      <h3 id="one-star-raids">One-Star Raids</h3>
      <li class="pkmn-list-item"><img src="https://cdn/pm371.icon.png" /><span class="shiny-icon"></span><div class="pkmn-name">Bagon</div></li>
      <h3 id="five-star-raids">Five-Star Raids*</h3>
      <li class="pkmn-list-item"><img src="https://cdn/pm380.icon.png" /><span class="shiny-icon"></span><div class="pkmn-name">Latias</div></li>
      <h2 id="go-pass">GO Pass</h2>
      <p>For US$4.99, upgrade to GO Pass Deluxe.</p>
      <h2 id="featured-pokémon-and-rewards">Featured Pokémon and Rewards</h2>
      <ul><li>Lucky Egg</li><li>Rare Candy</li></ul>
      <ul><li>Premium Battle Pass</li></ul>
    </div><footer></footer>`;

    const ev = parseEventHtml(html, baseEvent({ name: 'Tropical Paradise' }));
    expect(ev.bonuses.map((b) => [b.group ?? null, !!b.paid])).toEqual([
      [null, false],
      ['Tier 1 – Rank 10', false],
      ['Tier 2 – Rank 20', true],
    ]);
    expect(ev.highlights.map((h) => h.kind)).toEqual(['debut', 'background']);
    expect(ev.spawnGroups.map((g) => g.label)).toEqual(['Spawns', 'December 4 to December 7']);
    expect(ev.raidGroups.map((g) => g.label)).toEqual(['One-Star Raids', 'Five-Star Raids*']);
    expect(ev.goPass?.price).toBe('US$4.99');
    expect(ev.goPass?.freeRewards).toEqual(['Lucky Egg', 'Rare Candy']);
    expect(ev.goPass?.deluxeRewards).toEqual(['Premium Battle Pass']);
  });
});
