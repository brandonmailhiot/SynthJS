// base duration of 1/32
const ts = 0.03125;

module.exports = {
  z: 0,
  ts, // thirty-second
  s: ts * 2, // sixteenth
  's.': ts * 3, // dotted sixteenth
  t: ts * (8 / 3),  // eighth-note triplet
  e: ts * 4, // eighth
  'e.': ts * 6, // dotted eighth
  q: ts * 8, // quarter
  'q.': ts * 12, // dotted quarter
  h: ts * 16, // half
  'h.': ts * 24, // dotted half
  w: ts * 32, // whole
  'w.': ts * 48, // dotted whole
};
