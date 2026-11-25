import { describe, expect, it } from 'vitest';
import { liveKey } from './tools.js';

const keys = new Set(['386', '386.fATTACK', '386.fDEFENSE', '386.fSPEED', '641.fINCARNATE', '641.fTHERIAN', '376', '376.fMEGA', '227', '227.fMEGA', '80.fGALARIAN', '94', '94.fMEGA', '6.fMEGA_X', '37.fALOLA', '25.fGOFEST_2024_STIARA']);
const known = { has: (k: string) => keys.has(k), dexOf: (n: string) => ({ skarmory: 227, charizard: 6 })[n.toLowerCase()] };

describe("Leek Duck's pictures and names as our forms", () => {
  it('our own naming', () => {
    expect(liveKey('https://cdn/pm376.fMEGA.icon.png', 'Mega Metagross', known)).toBe('376.fMEGA');
    expect(liveKey('https://cdn/pm25.fGOFEST_2024_STIARA.icon.png', 'Sun Crown Pikachu', known)).toBe('25.fGOFEST_2024_STIARA');
  });
  it('the numbered form, told by the name', () => {
    expect(liveKey('https://cdn/pokemon_icon_386_11.png', 'Deoxys (Normal)', known)).toBe('386');
    expect(liveKey('https://cdn/pokemon_icon_386_13.png', 'Deoxys (Defense)', known)).toBe('386.fDEFENSE');
    expect(liveKey('https://cdn/pokemon_icon_386_14.png', 'Deoxys (Speed)', known)).toBe('386.fSPEED');
    expect(liveKey('https://cdn/pokemon_icon_641_11.png', 'Shadow Tornadus (Incarnate Forme)', known)).toBe('641.fINCARNATE');
    expect(liveKey('https://cdn/pokemon_icon_094_51.png', 'Mega Gengar', known)).toBe('94.fMEGA');
    expect(liveKey('https://cdn/pokemon_icon_037_61.png', 'Alolan Vulpix', known)).toBe('37.fALOLA');
  });
  it('just a name', () => {
    expect(liveKey('https://cdn/Mega%20Skarmory.png', 'Mega Skarmory', known)).toBe('227.fMEGA');
    expect(liveKey('https://cdn/Mega%20Charizard%20X.png', 'Mega Charizard X', known)).toBe('6.fMEGA_X');
  });
  it('an unknown form falls back to the species', () => {
    expect(liveKey('https://cdn/pokemon_icon_376_00.png', 'Metagross (Sparkly)', known)).toBe('376');
  });
});
