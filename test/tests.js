const assert = require('chai').assert;
const Offbeat = require('../src/Offbeat.js');
const nodeContext = require('web-audio-api').AudioContext;

describe('Offbeat declared with defaults', () => {
  describe('#time()', () => {
    it('should return the default time', () => {
      const melody = new Offbeat({ context: nodeContext });
      const time = melody.time();
      assert.equal(time, 0);
    });
  });

  describe('#to_time(1)', () => {
    it('should return 4 seconds', () => {
      const melody = new Offbeat({ context: nodeContext });
      const time = melody.to_time(1);
      assert.equal(time, 4);
    });
  });
});


describe('Offbeat declared with custom object', () => {
  describe('#parse_notes()', () => {
    it('should return array of notes', () => {
      const melody = new Offbeat({
        notes: 'a b, c d, e f',
        context: nodeContext,
      });
      const notes = melody.notesParsed;
      assert.deepEqual(notes, [['a', 'b'], ['c', 'd'], ['e', 'f']]);
    });
  });

  describe('#time()', () => {
    it('should return time of audio in seconds', () => {
      const melody = new Offbeat({
        tempo: 120,
        timeSig: '12/8',
        notes: 't a1, t a1, t a1',
        context: nodeContext,
      });
      const time = melody.time().toFixed(2);
      assert.equal(time, 1.50);
    });
  });

  describe('#to_time(1)', () => {
    it('should return 6 seconds', () => {
        const melody = new Offbeat({
            tempo: 120,
            timeSig: '12/8',
            notes: 't a1, t a1, t a1',
            context: nodeContext,
        });
        const time = melody.to_time(1);
        assert.equal(time, 6);
    });
  });

  describe('#brief()', () => {
    it('should return unique, sorted, origin notes', () => {
      const melody = new Offbeat({
        notes: 'q c3, q d3, q e3, q f3, q g3, q a3, q b3',
        context: nodeContext,
      });
      const brief = melody.brief();
      assert.deepEqual(brief, ['c1', 'd1', 'e1', 'f1', 'g1', 'a1', 'b1']);
    });
  });

  describe('#countNotes()', () => {
    it('should return count of all notes', () => {
      const melody = new Offbeat({
        notes: 'q c3, q d3, q e3, q f3, q g3, q a3, q b3',
        context: nodeContext,
      });
      const count = melody.countNotes();
      assert.deepEqual(count, { a3: 1, b3: 1, c3: 1, d3: 1, e3: 1, f3: 1, g3: 1 });
    });
  });
});
