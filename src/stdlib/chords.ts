export const CHORDS_SOURCE = `\\version "2.0"

/// Major triad: root, +4, +7
triad_major(root) = 4 <root root+4 root+7>

/// Minor triad: root, +3, +7
triad_minor(root) = 4 <root root+3 root+7>

/// Diminished triad: root, +3, +6
triad_dim(root) = 4 <root root+3 root+6>

/// Augmented triad: root, +4, +8
triad_aug(root) = 4 <root root+4 root+8>

/// Sus2 chord: root, +2, +7
triad_sus2(root) = 4 <root root+2 root+7>

/// Sus4 chord: root, +5, +7
triad_sus4(root) = 4 <root root+5 root+7>

/// Major 7th: root, +4, +7, +11
seventh_major(root) = 4 <root root+4 root+7 root+11>

/// Dominant 7th: root, +4, +7, +10
seventh_dom(root) = 4 <root root+4 root+7 root+10>

/// Minor 7th: root, +3, +7, +10
seventh_minor(root) = 4 <root root+3 root+7 root+10>

/// Half-diminished 7th: root, +3, +6, +10
seventh_half_dim(root) = 4 <root root+3 root+6 root+10>

/// Diminished 7th: root, +3, +6, +9
seventh_dim(root) = 4 <root root+3 root+6 root+9>
`;
