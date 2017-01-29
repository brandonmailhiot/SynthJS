'use strict'
const assert = require('chai').assert,
Offbeat = require('../lib/Offbeat.js')

describe('Offbeat declared without melody object', () => {
  describe('#time()', () => {
    it('should return the default time', () => {
      const time = new Offbeat().time()
      assert.equal(time, 0)
    })
  })
  describe('#to_time(1)', () => {
    it('should return 4 seconds', () => {
      const time = new Offbeat().to_time(1)
      assert.equal(time, 4)
    })
  })
})

describe('Offbeat declared with melody object', () => {
  describe('#parse_notes(notes)', () => {
    it('should return array of notes', () => {
      const layer = new Offbeat({
        notes: `a b, c d, e f`
      }),
      notes = layer.parse_notes(layer.notes)
      assert.deepEqual(notes, [['a','b'],['c','d'],['e','f']])
    })
  })
  describe('#time()', () => {
    it('should return time of audio in seconds', () => {
      const time = new Offbeat({
        tempo: 120,
        timeSig: '12/8',
        notes: 't a1, t a1, t a1'
      }).time().toFixed(2)
      assert.equal(time, 1.50)
    })
  })
  describe('#to_time(1)', () => {
    it('should return 6 seconds', () => {
      const time = new Offbeat({
        tempo: 120,
        timeSig: '12/8',
        notes: 't a1, t a1, t a1'
    }).to_time(1)
      assert.equal(time, 6)
    })
  })
  describe('#queryKey()', () => {
    it('should return C Major', () => {
      const melody = new Offbeat({
        notes: 'q c3, q d3, q e3, q f3, q g3, q a3, q b3'
      })
      assert.equal(melody.queryKey(), 'c major')
    })
  })
})
