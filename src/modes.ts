export type Mode = "major" | "minor" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "locrian";

export const MODES: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

export function isMode(s: string): s is Mode {
  return Object.hasOwn(MODES, s);
}

export function modeIntervals(m: Mode): readonly number[] {
  return MODES[m];
}
