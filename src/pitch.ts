export type NoteLetter = "a" | "b" | "c" | "d" | "e" | "f" | "g";
export type Accidental = "##" | "#" | "b" | "bb" | "n";

export type PitchSpec = {
  letter: NoteLetter;
  accidental: Accidental | null;
  octave: number;
  cents: number;
};

const BASE_SEMITONE: Record<NoteLetter, number> = {
  c: -9,
  d: -7,
  e: -5,
  f: -4,
  g: -2,
  a: 0,
  b: 2,
};

const ACCIDENTAL_OFFSET: Record<Accidental, number> = {
  "##": 2,
  "#": 1,
  b: -1,
  bb: -2,
  n: 0,
};

export function isNoteLetter(s: string): s is NoteLetter {
  return s.length === 1 && Object.hasOwn(BASE_SEMITONE, s);
}

export function computeFrequency(p: PitchSpec): number {
  const accOffset = p.accidental === null ? 0 : ACCIDENTAL_OFFSET[p.accidental];
  const semitones = BASE_SEMITONE[p.letter] + accOffset + (p.octave - 4) * 12;
  return 440 * 2 ** ((semitones + p.cents / 100) / 12);
}

export function parsePitchString(s: string): PitchSpec | null {
  // Pattern: letter accidental? octave cent_offset?
  const re = /^([a-g])(##|bb|#|b|n)?(\d)(?:([+-])(\d+)c)?$/;
  const m = re.exec(s);
  if (!m) return null;
  const [, letter, acc, oct, sign, centsStr] = m;
  if (!letter || !oct) return null;
  if (!isNoteLetter(letter)) return null;
  const cents =
    centsStr === undefined ? 0 : (sign === "-" ? -1 : 1) * Number.parseInt(centsStr, 10);
  return {
    letter,
    accidental: (acc as Accidental | undefined) ?? null,
    octave: Number.parseInt(oct, 10),
    cents,
  };
}
