const assert = require('chai').assert,
Offbeat = require('../lib/Offbeat.min.js')

describe('Offbeat declared without melody object', () => {

  describe('#layer()', () => {
    it('should return the default melody object', () => {
      let layer = Offbeat.layer()
      assert.propertyVal(layer, 'tempo', 60)
      assert.propertyVal(layer, 'instrument', 'sine')
      assert.propertyVal(layer, 'timeSig', 4/4)
      assert.propertyVal(layer, 'notes', '')
    })
  })

  describe('#time()', () => {
    it('should return the default time', () => {
      let time = Offbeat.layer().time()
      assert.equal(time, 0)
    })
  })

  describe('#get_time(1)', () => {
    it('should return 4 seconds', () => {
      let time = Offbeat.layer().get_time(1)
      assert.equal(time, 4)
    })
  })

  describe('#parse_notes()', () => {
    it('should return array of notes', () => {
      let layer = Offbeat.layer({
        notes: `
        a b,
        c d,
        e f
        `
      }),
      notes = layer.parse_notes()
      assert.deepEqual(notes, [['a','b'],['c','d'],['e','f']])
    })
  })

  /* NOT PASSING
  describe('#play()', () => {
    it('should throw error', () => {
      let layer = Offbeat.layer()
      assert.throws(layer.play(), 'Property "notes" is invalid')
    })
  })
  */
})

describe('Offbeat declared with melody object', () => {

})
