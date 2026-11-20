/**
 * Fuzzy subsequence matcher with an optimal (DP) alignment.
 *
 * Scores favour matches at the start of the string, at word boundaries
 * (after a space, dash, slash, dot, underscore, # or a camelCase hump) and in
 * consecutive runs. Whitespace in the query is ignored so "chg stat" finds
 * "Change ticket status". Returns the matched character indices for
 * highlighting, or null if the query is not a subsequence of the text.
 */
export interface FuzzyResult {
  score: number;
  indices: number[];
}

const BOUNDARY = /[\s\-_/.#:()[\]]/;

function boundaryBonus(text: string, j: number): number {
  if (j === 0) return 10;
  const prev = text[j - 1];
  const cur = text[j];
  if (BOUNDARY.test(prev)) return 7;
  if (prev >= "a" && prev <= "z" && cur >= "A" && cur <= "Z") return 6;
  if (/[a-zA-Z]/.test(cur) && /[0-9]/.test(prev)) return 3;
  return 0;
}

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.replace(/\s+/g, "").toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  const n = q.length;
  const m = t.length;
  if (n > m) return null;

  // Quick reject: is q a subsequence of t at all?
  for (let i = 0, j = 0; i < n; j++) {
    if (j >= m) return null;
    if (q[i] === t[j]) i++;
  }

  const NEG = -1e9;
  // best[i][j] = best score with q[i] matched at t[j]; from[i][j] = previous j.
  const best: Float64Array[] = Array.from({ length: n }, () => new Float64Array(m).fill(NEG));
  const from: Int32Array[] = Array.from({ length: n }, () => new Int32Array(m).fill(-1));

  for (let j = 0; j < m; j++) {
    if (t[j] !== q[0]) continue;
    // Small penalty for every unmatched leading character (capped).
    best[0][j] = 1 + boundaryBonus(text, j) - Math.min(j, 12) * 0.25;
  }
  for (let i = 1; i < n; i++) {
    let runMax = NEG;
    let runArg = -1;
    for (let j = 1; j < m; j++) {
      // Track the best predecessor at k ≤ j-2 (a gap of ≥1 char).
      const k = j - 2;
      if (k >= 0 && best[i - 1][k] > runMax) {
        runMax = best[i - 1][k];
        runArg = k;
      }
      if (t[j] !== q[i]) continue;
      const bonus = 1 + boundaryBonus(text, j);
      const consecutive = best[i - 1][j - 1] > NEG ? best[i - 1][j - 1] + bonus + 6 : NEG;
      const gapped = runMax > NEG ? runMax + bonus - 1.5 : NEG;
      if (consecutive >= gapped && consecutive > NEG) {
        best[i][j] = consecutive;
        from[i][j] = j - 1;
      } else if (gapped > NEG) {
        best[i][j] = gapped;
        from[i][j] = runArg;
      }
    }
  }

  let end = -1;
  let top = NEG;
  for (let j = 0; j < m; j++) if (best[n - 1][j] > top) { top = best[n - 1][j]; end = j; }
  if (end < 0) return null;

  const indices: number[] = new Array(n);
  for (let i = n - 1, j = end; i >= 0; i--) {
    indices[i] = j;
    j = from[i][j];
  }
  // Prefer shorter targets slightly; an exact match is always best.
  let score = top - m * 0.05;
  if (t === q) score += 20;
  return { score, indices };
}
