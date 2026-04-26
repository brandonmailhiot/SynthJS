export const DRUMS_SOURCE = `\\version "2.0"

/// Kick drum — low sine, fast attack, fast decay
instrument define kick_drum {
  oscillator sine
  envelope percussive(0.001, 0.15)
  detune -1200
}

/// Snare drum — band-passed white noise burst
instrument define snare_drum {
  oscillator noise
  envelope percussive(0.001, 0.12)
  filter bandpass(1800, 1.4)
}

/// Closed hi-hat — narrow resonant noise, sharp tick
instrument define hat_closed {
  oscillator noise
  envelope percussive(0.0005, 0.008)
  filter bandpass(11000, 12)
}

/// Open hi-hat — narrow resonant noise, longer sizzle
instrument define hat_open {
  oscillator noise
  envelope percussive(0.0005, 0.08)
  filter bandpass(11000, 12)
}

/// ============================================================
/// 808-style kit — vintage Roland TR-808 character via stacks
/// + filter cascades. Drop-in replacements for the noise/sine
/// variants above. The original 808 used pitch-envelope sweeps
/// for kick and toms which this DSL does not yet support, so
/// those pieces are static-pitch approximations.
/// ============================================================

/// 808-style bass drum — sine body + sub layer, lowpassed.
/// Play at a low pitch (c2, a1) and let the percussive envelope
/// shape the boom. Lacks the iconic 808 pitch sweep.
instrument define bass_drum_808 {
  oscillator sine
  oscillator sine -7
  envelope percussive(0.002, 0.45)
  filter lowpass(120, 1.0)
  detune -1200
}

/// 808-style snare — two detuned triangles for tonal body
/// stacked with noise for the wire rattle. Bandpass focuses the
/// snap. Play at c4/d4.
instrument define snare_drum_808 {
  oscillator triangle -1200
  oscillator triangle -1500
  oscillator noise
  envelope percussive(0.001, 0.15)
  filter highpass(800, 0.7)
  filter bandpass(2000, 1.5)
}

/// 808-style low tom — sine, deep
instrument define tom_low_808 {
  oscillator sine -800
  envelope percussive(0.005, 0.45)
  filter lowpass(800, 1.0)
}

/// 808-style mid tom — sine, mid
instrument define tom_mid_808 {
  oscillator sine -400
  envelope percussive(0.005, 0.4)
  filter lowpass(1000, 1.0)
}

/// 808-style high tom — sine, high
instrument define tom_high_808 {
  oscillator sine -100
  envelope percussive(0.005, 0.35)
  filter lowpass(1200, 1.0)
}

/// 808-style hand clap — bandpassed noise burst. Lacks the
/// authentic four-burst envelope shape of the original.
instrument define clap_808 {
  oscillator noise
  envelope percussive(0.005, 0.08)
  filter bandpass(1500, 2.0)
}

/// 808-style rim shot — two squares at an inharmonic ratio
/// through a tight bandpass for the metallic click.
instrument define rim_808 {
  oscillator square -300
  oscillator square 700
  envelope percussive(0.0005, 0.04)
  filter bandpass(2200, 4.0)
}

/// 808-style cowbell — two squares at the canonical 540 Hz +
/// 800 Hz ratio (≈ 660 cents apart). Play around g5 for the
/// classic pitch.
instrument define cowbell_808 {
  oscillator square -660
  oscillator square
  envelope percussive(0.001, 0.3)
  filter bandpass(800, 2.0)
}

/// 808-style claves — high triangle click with tight bandpass
instrument define clave_808 {
  oscillator triangle 600
  envelope percussive(0.0005, 0.05)
  filter bandpass(2500, 4.0)
}

/// 808-style maracas — short highpassed noise pip
instrument define maraca_808 {
  oscillator noise
  envelope percussive(0.001, 0.04)
  filter highpass(6000, 1.0)
}

/// 808-style closed hi-hat — six inharmonic square waves through a high
/// bandpass cascade. Metallic, vintage character. Play around f6/g6.
instrument define hat_closed_808 {
  oscillator square -1019
  oscillator square -337
  oscillator square
  oscillator square 599
  oscillator square 654
  oscillator square 1336
  envelope percussive(0.0005, 0.012)
  filter highpass(7000, 0.7)
  filter bandpass(10000, 6)
}

/// 808-style open hi-hat — same square stack, longer decay
instrument define hat_open_808 {
  oscillator square -1019
  oscillator square -337
  oscillator square
  oscillator square 599
  oscillator square 654
  oscillator square 1336
  envelope percussive(0.0005, 0.18)
  filter highpass(7000, 0.7)
  filter bandpass(10000, 6)
}

/// 808-style cymbal — broad inharmonic stack with long decay,
/// bandpassed in the cymbal sizzle range.
instrument define cymbal_808 {
  oscillator square -1200
  oscillator square -700
  oscillator square -200
  oscillator square 300
  oscillator square 800
  oscillator square 1500
  envelope percussive(0.001, 0.9)
  filter highpass(5000, 0.7)
  filter bandpass(8000, 4)
}

/// Tom (low) — sine pitched down
instrument define tom_low {
  oscillator sine
  envelope percussive(0.005, 0.3)
  detune -800
}

/// Tom (high) — sine slightly pitched down
instrument define tom_high {
  oscillator sine
  envelope percussive(0.005, 0.3)
  detune -300
}
`;
