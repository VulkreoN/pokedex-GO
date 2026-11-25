/**
 * Full moons, by Jean Meeus's method (Astronomical Algorithms, ch. 49): accurate to a few minutes, enough to know
 * which evening Ursaring can evolve into Ursaluna.
 */
const rad = Math.PI / 180;

function fullMoonJde(k: number): number {
  const T = k / 1236.85;
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T ** 2 - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T ** 2;
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T ** 2 - 0.00000011 * T ** 3) * rad;
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T ** 2 + 0.00001238 * T ** 3 - 0.000000058 * T ** 4) * rad;
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T ** 2 - 0.00000227 * T ** 3 + 0.000000011 * T ** 4) * rad;
  const O = (124.7746 - 1.56375588 * k + 0.0020672 * T ** 2 + 0.00000215 * T ** 3) * rad;
  const s = Math.sin;
  const corr =
    -0.40614 * s(Mp) + 0.17302 * E * s(M) + 0.01614 * s(2 * Mp) + 0.01043 * s(2 * F) + 0.00734 * E * s(Mp - M) - 0.00515 * E * s(Mp + M) +
    0.00209 * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) +
    0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F) - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O) - 0.00007 * s(Mp + 2 * M) +
    0.00004 * s(2 * Mp - 2 * F) + 0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F) +
    0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
  return jde + corr;
}

const toDate = (jde: number) => new Date((jde - 2440587.5) * 86_400_000);

/** The next `count` full moons after `from` (the one under way included when it was less than a day ago). */
export function nextFullMoons(from: Date, count: number): Date[] {
  const years = (from.getTime() - Date.UTC(2000, 0, 6)) / (365.25 * 86_400_000);
  let k = Math.floor(years * 12.3685) - 1;
  const out: Date[] = [];
  while (out.length < count) {
    const d = toDate(fullMoonJde(k + 0.5));
    if (d.getTime() > from.getTime() - 86_400_000) out.push(d);
    k++;
  }
  return out;
}
