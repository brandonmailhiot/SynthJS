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
