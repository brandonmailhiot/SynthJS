/**
 * Compute a simple line-based diff between two DSL revisions. The output is
 * a list of equal/added/removed runs plus the inclusive 1-based line range
 * of changes — used by the demo to drive the "listen to before / after"
 * playback (which renders only the affected line range via `isolateIR`).
 */

export type DiffSegment =
  | { type: "equal"; lines: string[] }
  | { type: "added"; lines: string[] }
  | { type: "removed"; lines: string[] };

export type LineDiff = {
  segments: DiffSegment[];
  /** Inclusive 1-based line range covering changed lines in the OLD revision. */
  oldRange: [number, number] | null;
  /** Inclusive 1-based line range covering changed lines in the NEW revision. */
  newRange: [number, number] | null;
};

/**
 * Longest-common-subsequence line diff. O(N×M) memory; fine for compositions
 * that fit in an editor (a few hundred lines worst case).
 */
export function diffLines(oldText: string, newText: string): LineDiff {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // Flat (n+1)*(m+1) buffer indexed as dp[i*(m+1)+j] keeps strict
  // `noUncheckedIndexedAccess` happy without sprinkling `!` everywhere.
  const stride = m + 1;
  const dp = new Int32Array((n + 1) * stride);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i * stride + j] = (dp[(i + 1) * stride + (j + 1)] ?? 0) + 1;
      } else {
        dp[i * stride + j] = Math.max(dp[(i + 1) * stride + j] ?? 0, dp[i * stride + (j + 1)] ?? 0);
      }
    }
  }
  const dpAt = (i: number, j: number): number => dp[i * stride + j] ?? 0;

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  let oldStart = -1;
  let oldEnd = -1;
  let newStart = -1;
  let newEnd = -1;

  const markChangedOld = (lineIdx: number) => {
    if (oldStart < 0) oldStart = lineIdx;
    oldEnd = lineIdx;
  };
  const markChangedNew = (lineIdx: number) => {
    if (newStart < 0) newStart = lineIdx;
    newEnd = lineIdx;
  };

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      const run: string[] = [];
      while (i < n && j < m && a[i] === b[j]) {
        run.push(a[i] ?? "");
        i++;
        j++;
      }
      segments.push({ type: "equal", lines: run });
    } else if (dpAt(i + 1, j) >= dpAt(i, j + 1)) {
      const run: string[] = [];
      while (i < n && (j >= m || a[i] !== b[j]) && dpAt(i + 1, j) >= dpAt(i, j + 1)) {
        run.push(a[i] ?? "");
        markChangedOld(i + 1);
        i++;
      }
      segments.push({ type: "removed", lines: run });
    } else {
      const run: string[] = [];
      while (j < m && (i >= n || a[i] !== b[j]) && dpAt(i + 1, j) < dpAt(i, j + 1)) {
        run.push(b[j] ?? "");
        markChangedNew(j + 1);
        j++;
      }
      segments.push({ type: "added", lines: run });
    }
  }
  if (i < n) {
    const run: string[] = [];
    while (i < n) {
      run.push(a[i] ?? "");
      markChangedOld(i + 1);
      i++;
    }
    segments.push({ type: "removed", lines: run });
  }
  if (j < m) {
    const run: string[] = [];
    while (j < m) {
      run.push(b[j] ?? "");
      markChangedNew(j + 1);
      j++;
    }
    segments.push({ type: "added", lines: run });
  }

  return {
    segments,
    oldRange: oldStart >= 0 ? [oldStart, oldEnd] : null,
    newRange: newStart >= 0 ? [newStart, newEnd] : null,
  };
}

/**
 * Render a diff as a unified-style text block for display in the demo.
 * Lines prefixed with `+ ` were added, `- ` removed, `  ` unchanged.
 * Equal runs longer than `contextLines` collapse with an ellipsis to keep
 * the preview compact.
 */
export function formatDiff(diff: LineDiff, contextLines = 2): string {
  const out: string[] = [];
  for (const seg of diff.segments) {
    if (seg.type === "equal") {
      if (seg.lines.length <= contextLines * 2) {
        for (const line of seg.lines) out.push(`  ${line}`);
      } else {
        for (let k = 0; k < contextLines; k++) out.push(`  ${seg.lines[k]}`);
        out.push("  …");
        for (let k = seg.lines.length - contextLines; k < seg.lines.length; k++) {
          out.push(`  ${seg.lines[k]}`);
        }
      }
    } else if (seg.type === "added") {
      for (const line of seg.lines) out.push(`+ ${line}`);
    } else {
      for (const line of seg.lines) out.push(`- ${line}`);
    }
  }
  return out.join("\n");
}
