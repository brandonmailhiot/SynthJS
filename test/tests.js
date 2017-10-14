const assert = require('chai').assert;
const Codebeat = require('../src/Codebeat.js');
const AudioContext = require('web-audio-api').AudioContext;

describe('Codebeat', () => {
  describe('#time()', () => {
    it('should return the default time', () => {
      const melody = new Codebeat({ context: AudioContext });
      const time = melody.time();
      assert.equal(time, 0);
    });
  });

  describe('#toTime(1)', () => {
    it('should return 4 seconds', () => {
      const melody = new Codebeat({ context: AudioContext });
      const time = melody.toTime(1);
      assert.equal(time, 4);
    });
  });

  describe('#parseNotes()', () => {
    it('should return array of notes', () => {
      const melody = new Codebeat({
        notes: 'a b, c d, e f',
        context: AudioContext,
      });
      notes = melody.parseNotes()
      notes = notes.map(n => [n.inputDuration, n.inputFrequency])
      assert.deepEqual(notes, [['a', 'b'], ['c', 'd'], ['e', 'f']]);
    });
  });

  describe('#time()', () => {
    it('should return time of audio in seconds', () => {
      const melody = new Codebeat({
        tempo: 120,
        timeSig: '12/8',
        notes: 't a1, t a1, t a1',
        context: AudioContext,
      });
      const time = melody.time().toFixed(2);
      assert.equal(time, 1.50);
    });
  });

  describe('#toTime(1)', () => {
    it('should return 6 seconds', () => {
        const melody = new Codebeat({
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
      const melody = new Codebeat({
        context: AudioContext,
      });
      // 55hz -> a1
      const name = Codebeat._noteName(55);
      assert.equal(name, 'a1');
    });
  });

  describe('#brief()', () => {
    it('should return unique, sorted, origin notes', () => {
      const melody = new Codebeat({
        notes: 'q c3, q d3, q e3, q f3, q g3, q a3, q b3',
        context: AudioContext,
      });
      const brief = melody.brief();
      assert.deepEqual(brief, ['c1', 'd1', 'e1', 'f1', 'g1', 'a1', 'b1']);
    });
  });

  describe('#countNotes()', () => {
    it('should return count of all notes', () => {
      const melody = new Codebeat({
        notes: 'q c3, q d3, q e3, q f3, q g3, q a3, q b3',
        context: AudioContext,
      });
      const count = melody.countNotes();
      assert.deepEqual(count, { a3: 1, b3: 1, c3: 1, d3: 1, e3: 1, f3: 1, g3: 1 });
    });
  });

  describe('#_expandMotifs()', () => {
    it('should create motifs', () => {
      const motifs = Codebeat._expandMotifs('motif = a b, c d, e f; motif');
      assert.deepEqual(motifs, [['a', 'b'], ['c', 'd'], ['e', 'f']]);
    });
  });

  describe('#_expandSlides()', () => {
    it('should add slide to fx array', () => {
      const motifs = Codebeat._expandMotifs('a b - c d, e f - g h');
      const slides = Codebeat._expandSlides(motifs);
      assert.deepEqual(slides, [['a', 'b', ['slide']], ['c', 'd', []], ['e', 'f', ['slide']], ['g', 'h', []]]);
    });
  });
});
