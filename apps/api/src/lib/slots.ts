/** Fixed times of day in a time zone ("0, 6, 12 and 18 h in Paris"), daylight saving included. */

/** Minutes a time zone is ahead of UTC at this instant (Paris: 60 in winter, 120 in summer). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant of hour:00 on that local day (y, m, d of the zone). */
function localInstant(y: number, m: number, d: number, hour: number, timeZone: string): number {
  const guess = Date.UTC(y, m, d, hour);
  // Twice: the offset at the guess can differ from the offset at the answer around a clock change.
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  return guess - offsetMinutes(new Date(first), timeZone) * 60_000;
}

/** Every slot instant from the day before `now` to two days after, in order. */
function slotsAround(now: Date, hours: number[], timeZone: string): number[] {
  const out: number[] = [];
  for (let day = -1; day <= 2; day++) {
    const local = new Date(now.getTime() + offsetMinutes(now, timeZone) * 60_000 + day * 86_400_000);
    for (const h of hours) out.push(localInstant(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, timeZone));
  }
  return out.sort((a, b) => a - b);
}

/** The next slot strictly after `now`. */
export function nextSlot(now: Date, hours: number[], timeZone: string): Date {
  return new Date(slotsAround(now, hours, timeZone).find((t) => t > now.getTime())!);
}

/** The latest slot at or before `now`. */
export function lastSlot(now: Date, hours: number[], timeZone: string): Date {
  return new Date(slotsAround(now, hours, timeZone).filter((t) => t <= now.getTime()).pop()!);
}
