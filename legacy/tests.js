const assert = require('chai').assert;
const SynthJS = require('../src/Synth');
const AudioContext = require('web-audio-api').AudioContext;

describe('#time()', () => {
  it('should return the default time', () => {
    const melody = new SynthJS({ context: AudioContext });
    const time = melody.time();
    assert.equal(time, 0);
  });

  it('should return time of audio in seconds', () => {
    const melody = new SynthJS({
      tempo: 120,
      timeSig: '12/8',
      notes: 't a1, t a1, t a1',
      context: AudioContext,
    });
    const time = melody.time().toFixed(2);
    assert.equal(time, 1.50);
  });
});

describe('#toTime()', () => {
  it('should return 4 seconds', () => {
    const melody = new SynthJS({ context: AudioContext });
    const time = melody.toTime(1);
    assert.equal(time, 4);
  });

  it('should return 6 seconds', () => {
    const melody = new SynthJS({
        tempo: 120,
        timeSig: '12/8',
        notes: 't a1, t a1, t a1',
        context: AudioContext,
    });
    const time = melody.toTime(1);
    assert.equal(time, 6);
  });
});

describe('#_noteName()', () => {
  it('should return name of note from frequency', () => {
    const melody = new SynthJS({
      context: AudioContext,
    });
    // 55hz -> a1
    const name = SynthJS._noteName(55);
    assert.equal(name, 'a1');
  });
});

describe('#brief()', () => {
  it('should return unique, sorted, origin notes', () => {
    const melody = new SynthJS({
      notes: 'q c3, q d3, q e3, q f3, q g3, q a3, q b3',
      context: AudioContext,
    });
    const brief = melody.brief();
    assert.deepEqual(brief, ['a0', 'c_0', 'b#1', 'd1', 'f_1', 'e#1', 'g1']);
  });
});

describe('#countNotes()', () => {
  it('should return count of all notes', () => {
    const melody = new SynthJS({
      notes: 'q c3, q d3, q e3, q f3, q g3, q a3, q b3',
      context: AudioContext,
    });
    const count = melody.countNotes();
    assert.deepEqual(count, { a3: 1, b3: 1, c3: 1, d3: 1, e3: 1, f3: 1, g3: 1 });
  });
});

describe('#_expandMotifs()', () => {
  it('should create motifs', () => {
    const motifs = SynthJS._expandMotifs('motif = e f1, h g1, q d1; motif');
    assert.deepEqual(motifs, {
      motifs: {},
      notes: [
        [ 'motif', '=', 'e', 'f1' ],
        [ 'h', 'g1' ],
        [ 'q', 'd1' ],
        [ 'motif' ]
      ],
    });
  });
});

describe('#_expandSlides()', () => {
  it('should add slide to fx array', () => {
    const motifs = SynthJS._expandMotifs('a b - c d, e f - g h');
    const multiples = SynthJS._expandMultiples(motifs);
    const slides = SynthJS._expandSlides(multiples);

    assert.deepEqual(slides, [['a', 'b', ['slide']], ['c', 'd', ['slide']], ['e', 'f', ['slide']], ['g', 'h', ['slide']]]);
  });
});
