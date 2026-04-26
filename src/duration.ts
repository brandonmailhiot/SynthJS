const VALID_DIVISORS = new Set([1, 2, 4, 8, 16, 32, 64]);

export function isValidDurationDivisor(n: number): boolean {
  return VALID_DIVISORS.has(n);
}

export function parseDuration(s: string): number | null {
  // int dot* triplet?
  const re = /^(\d+)(\.*)(t)?$/;
  const m = re.exec(s);
  if (!m) return null;
  const [, intStr, dots, triplet] = m;
  if (!intStr) return null;
  const divisor = Number.parseInt(intStr, 10);
  if (!isValidDurationDivisor(divisor)) return null;
  let value = 1 / divisor;
  let increment = value / 2;
  for (let i = 0; i < (dots?.length ?? 0); i++) {
    value += increment;
    increment /= 2;
  }
  if (triplet === "t") value *= 2 / 3;
  return value;
}
