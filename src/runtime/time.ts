export function beatsToSeconds(beats: number, tempo: number): number {
  if (tempo <= 0) throw new RangeError("tempo must be positive");
  // beats = fraction-of-whole-note (e.g. 0.25 = quarter)
  // tempo = quarter notes per minute
  // quarter = 60/tempo seconds; whole = 4 * quarter
  return beats * 4 * (60 / tempo);
}
