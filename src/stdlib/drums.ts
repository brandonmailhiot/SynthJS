export const DRUMS_SOURCE = `\\version "2.0"

/// Kick drum — low sine, fast attack, fast decay
instrument define kick_drum {
  oscillator sine
  envelope percussive(0.001, 0.15)
  detune -1200
}

/// Snare drum — square + highpass
instrument define snare_drum {
  oscillator square
  envelope percussive(0.001, 0.08)
  filter highpass(800, 1.0)
}

/// Closed hi-hat — square + highpass, very short decay
instrument define hat_closed {
  oscillator square
  envelope percussive(0.0005, 0.03)
  filter highpass(8000, 0.8)
  detune 1200
}

/// Open hi-hat — same as closed but longer decay
instrument define hat_open {
  oscillator square
  envelope percussive(0.0005, 0.25)
  filter highpass(8000, 0.8)
  detune 1200
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
