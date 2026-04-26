export const INSTRUMENTS_SOURCE = `\\version "2.0"

/// Mellow sawtooth pad with slight detune
instrument define warm_pad {
  oscillator sawtooth
  envelope adsr(0.3, 0.4, 0.7, 1.2)
  filter lowpass(1500, 0.4)
  detune 5
}

/// Bright lead saw with fast attack
instrument define lead_saw {
  oscillator sawtooth
  envelope adsr(0.005, 0.1, 0.8, 0.2)
  filter lowpass(4000, 0.7)
}

/// Brass-like square with bandpass
instrument define brass {
  oscillator square
  envelope adsr(0.05, 0.2, 0.7, 0.3)
  filter bandpass(2000, 0.5)
  detune -3
}

/// Bass synth — low square, short release
instrument define bass_synth {
  oscillator square
  envelope adsr(0.005, 0.1, 0.6, 0.1)
  filter lowpass(1000, 1.2)
  detune -1200
}

/// Bell — fast attack, long decay
instrument define bell {
  oscillator sine
  envelope adsr(0.001, 0.4, 0.2, 1.5)
  detune 7
}

/// String pad — slow attack, full sustain
instrument define string_pad {
  oscillator triangle
  envelope adsr(0.5, 0.3, 0.9, 1.0)
  filter lowpass(3000, 0.4)
}
`;
