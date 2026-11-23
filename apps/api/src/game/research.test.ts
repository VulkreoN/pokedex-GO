import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResearch, parseResearch } from './research.js';

const mon = (dex: number, name: string) =>
  `<li class="reward" data-reward-type="encounter" data-reward-filter="less"><span class="reward-bubble encounter-reward"><img class="reward-image" src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm${dex}.icon.png" /><span class="shiny-badge" role="img" aria-label="Can be Shiny"><svg class="shiny-icon" aria-hidden="true"><use href="#shiny-icon" /></svg></span></span><span class="reward-label"><span>${name}</span></span><span class="cp-values"><span class="max-cp"><div>Max CP</div> 117 </span><span class="min-cp"><div>Min CP</div> 99 </span></span></li>`;
const item = (name: string, n: number) =>
  `<li class="reward" data-reward-type="item"><span class="reward-bubble resource-reward"><img class="reward-image" src="https://cdn.leekduck.com/assets/img/items/${name}.png" /><div class="quantity">×${n}</div></span><span class="reward-label">${name} <span>×${n}</span></span></li>`;
const energy = `<li class="reward" data-reward-type="resource" data-reward-filter="less"><span class="reward-bubble resource-reward"><img class="reward-image" src="https://cdn.leekduck.com/assets/img/mega_energy/Sceptile Mega Energy.png" /><div class="resource-info"><img class="reward-image" src="https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm254.icon.png" /></div><div class="quantity">×1,000</div></span><span class="reward-label">Sceptile Mega Energy <span>×1,000</span></span></li>`;
const task = (text: string, rewards: string) => `<li class="task-item"><span class="task-text"><span>${text}</span></span><ul class="reward-list">${rewards}</ul></li>`;
const page =
  `<div class="field-research-wrapper hide-items">` +
  `<div class="task-category event-field-research" style="--cat:#f39c12;" data-event-end="2026-11-23T20:00:00-0800"><h2>Dynamax Trails Tasks</h2><ul class="task-list">${task('Catch 8 Pokémon', mon(1, 'Bulbasaur'))}</ul></div>` +
  `<div class="task-category event-field-research" data-event-end="2026-11-21T17:00:00-0800"><h2>Pawniard Community Day Tasks</h2><ul class="task-list">${task('Catch 5 Pokémon', mon(624, 'Pawniard'))}</ul></div>` +
  `<div class="task-category" style="--cat:#1abc9c;"><h2>Catching Tasks</h2><ul class="task-list">${task('Power up Pokémon 8 times', mon(129, 'Magikarp') + item('Pinap Berry', 3))}${task('Win a raid', energy)}</ul></div>` +
  `</div><section class="research-breakthrough-section"><li class="breakthrough-reward-item">x</li></section>`;

afterEach(() => vi.unstubAllGlobals());

describe('parseResearch', () => {
  it('keeps event tasks apart, with their end, and reads item rewards', () => {
    const c = parseResearch(page);
    expect(c.map((x) => [x.title, x.event, x.end])).toEqual([
      ['Dynamax Trails Tasks', true, '2026-11-24T04:00:00.000Z'],
      ['Pawniard Community Day Tasks', true, '2026-11-22T01:00:00.000Z'],
      ['Catching Tasks', false, null],
    ]);
    const [powerUp, raid] = c[2]!.tasks;
    expect(powerUp!.text).toBe('Power up Pokémon 8 times');
    expect(powerUp!.rewards).toEqual([
      { kind: 'encounter', name: 'Magikarp', image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png', canBeShiny: true, combatPower: { min: 99, max: 117 } },
      { kind: 'item', name: 'Pinap Berry', image: 'https://cdn.leekduck.com/assets/img/items/Pinap%20Berry.png', quantity: 3 },
    ]);
    expect(raid!.rewards).toEqual([{ kind: 'resource', name: 'Sceptile Mega Energy', image: 'https://cdn.leekduck.com/assets/img/mega_energy/Sceptile%20Mega%20Energy.png', quantity: 1000, dex: 254 }]);
  });
});

describe('getResearch', () => {
  it('drops event tasks once the event is over', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(page)));
    const c = await getResearch(Date.parse('2026-11-23T12:00:00Z'));
    expect(c.map((x) => x.title)).toEqual(['Dynamax Trails Tasks', 'Catching Tasks']);
  });
});
