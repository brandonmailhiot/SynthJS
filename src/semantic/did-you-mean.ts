export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0] ?? i;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min((dp[j] ?? 0) + 1, (dp[j - 1] ?? 0) + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[b.length] ?? 0;
}

export function didYouMean(input: string, candidates: readonly string[]): string | null {
  if (input.length === 0) return null;
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  if (best === null) return null;
  const threshold = Math.max(1, Math.floor(Math.max(input.length, best.length) / 2));
  return bestDist <= threshold ? best : null;
}
