export const DRUMS_SAMPLED_SOURCE = `\\version "2.0"

/// Sampled bass drum — bundled stdlib sample, plays at original pitch.
instrument define kick_real {
  oscillator sample("@stdlib/samples/kick")
}

/// Sampled snare drum — bundled stdlib sample.
instrument define snare_real {
  oscillator sample("@stdlib/samples/snare")
}

/// Sampled hand clap — bundled stdlib sample.
instrument define clap_real {
  oscillator sample("@stdlib/samples/clap")
}

/// Sampled closed hi-hat — bundled stdlib sample.
instrument define hat_closed_real {
  oscillator sample("@stdlib/samples/hat_closed")
}

/// Sampled open hi-hat — bundled stdlib sample.
instrument define hat_open_real {
  oscillator sample("@stdlib/samples/hat_open")
}

/// Sampled low tom.
instrument define tom_low_real {
  oscillator sample("@stdlib/samples/tom_low")
}

/// Sampled mid tom.
instrument define tom_mid_real {
  oscillator sample("@stdlib/samples/tom_mid")
}

/// Sampled high tom.
instrument define tom_high_real {
  oscillator sample("@stdlib/samples/tom_high")
}

/// Sampled cowbell.
instrument define cowbell_real {
  oscillator sample("@stdlib/samples/cowbell")
}
`;
