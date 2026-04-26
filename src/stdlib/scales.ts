export const SCALES_SOURCE = `\\version "2.0"

/// Major scale (Ionian) — 8-note ascending
major_scale(root) = 4 root root+2 root+4 root+5 root+7 root+9 root+11 root+12

/// Natural minor scale (Aeolian)
minor_scale(root) = 4 root root+2 root+3 root+5 root+7 root+8 root+10 root+12

/// Pentatonic major
pentatonic_major(root) = 4 root root+2 root+4 root+7 root+9 root+12

/// Pentatonic minor
pentatonic_minor(root) = 4 root root+3 root+5 root+7 root+10 root+12

/// Blues scale
blues(root) = 4 root root+3 root+5 root+6 root+7 root+10 root+12

/// Dorian mode
dorian_scale(root) = 4 root root+2 root+3 root+5 root+7 root+9 root+10 root+12

/// Mixolydian mode
mixolydian_scale(root) = 4 root root+2 root+4 root+5 root+7 root+9 root+10 root+12
`;
