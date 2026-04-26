export const FX_SOURCE = `\\version "2.0"

// @stdlib/fx — effect presets (use inline)
//
//   with reverb(2, 3.0, 0.85) { ... }    // hall reverb
//   with reverb(2, 0.8, 0.7)  { ... }    // room reverb
//   with delay(0.4, 0.45)     { ... }    // tape delay
//   with chorus(0.3, 0.005, 0.5) { ... } // chorus pad
//   with distortion(15, "2x") { ... }    // warm drive
//
// Block-parameter motifs that wrap effects (planned for v2.x) will
// expose these as named macros.
`;
