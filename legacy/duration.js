// base duration of 1/32
const ts = 0.03125;

module.exports = {
  // zero
  z: 0,

  // thirty-second
  ts,

  // sixteenth
  s: ts * 2,

  // dotted sixteenth
  's.': ts * 3,

  // eighth-note triplet
  t: ts * (8 / 3),

  // eighth
  e: ts * 4,

  // dotted eighth
  'e.': ts * 6,

  // quarter
  q: ts * 8,

  // dotted quarter
  'q.': ts * 12,

  // half
  h: ts * 16,

  // dotted half
  'h.': ts * 24,

  // whole
  w: ts * 32,

  // dotted whole
  'w.': ts * 48,

  // indefinite
  i: 1000.00000,
};
