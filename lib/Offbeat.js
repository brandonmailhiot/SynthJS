'use strict'
const Frequency = require('./frequency'),
Duration = require('./duration')

class Offbeat {
	/**
	* Create an instance of Offbeat.
	* @constructor
	* @param {Object} props - Initialize with tempo, timeSig, instrument, notes, and loop properties.
	*/
	constructor(props) {
		this.tempo      = props.tempo || 60
		this.timeSig    = props.timeSig || '4/4'
		this.instrument = props.instrument || 'sine'
		this.notes      = props.notes || ''
		this.loop       = props.loop || false
		this.context    = new (props.context || window.AudioContext || window.webkitAudioContext)()
		this.parse_notes()
		this.get_bpm()
	}

	/**
     * Update current properties.
	 * @param {Object} props - Update the tempo, timeSig, instrument, notes, and/or loop properties.
     */
	update(props) {
		Object.keys(props).forEach(key => {
			this[key] = props[key]
		})
		this.parse_notes()
		this.get_bpm()
	}

	/**
	* Calculate duration in seconds.
	* @param {number} duration - Note duration relative to one measure.
	* @return {number} Time of duration in seconds.
	*/
	to_time(duration) {
		return (duration * this.beatsPerMeasure * 60) / this.tempo
	}

	/**
	* Get the number of beats per measure based on the timeSig property numerator.
	* Called on initialization or update().
	*/
	get_bpm() {
		this.beatsPerMeasure = parseInt(this.timeSig, 10)
	}

	/**
	* Open an audio context.
	* @param {string} nodeContext - Required for node web audio API (used for testing).
	*/
	create_context(nodeContext) {
		this.context = new (nodeContext || window.AudioContext || window.webkitAudioContext)()
	}

	/**
	* Parse this.notes into an array of note objects.
	*/
	parse_notes() {
		const parse = n => { return n.trim().split(' ') },
		multiply = {
			occursAt: [],
			augment: 0
		},
		motifs = {}

		let notes = this.notes,
		notesArray = (function () {
			let delimiter = ';'

			if (notes.includes(delimiter)) {
				notes = notes.split(delimiter)
				let motifOccursAt = [],
				operator = '='

				notes.forEach((n, i) => {
					if (n.includes(operator)) {
						let motif = n
							.split(operator)
							.map(m => m.trim())

						motifs[motif[0]] = motif[1]
						motifOccursAt.push(i)
					}
				})

				notes = notes
					.filter((n, i) => !motifOccursAt.includes(i))
					.reduce((a,b) => a.concat(',' + b))
					.split(',')
					.map(n => n.trim())
					.map((n, i) => motifs.hasOwnProperty(n) ? motifs[n] : n)
					.join(',')
			}

			return notes.split(',')
		}())

		notesArray = notesArray.map(note => parse(note))

		notesArray.forEach((n, i) => {
			if (n.includes('*')) {
				multiply.occursAt.push(i)
			}
		})

		for (let index of multiply.occursAt) {
			index += multiply.augment
			let note = notesArray[index]
			for (let i = 1; i < note[3]; i++) {
				notesArray.splice(index + 1, 0, [note[0], note[1]])
				multiply.augment++
			}
		}

		this.notesParsed = notesArray.map((note, i, self) => {
			return {
				inputDuration: note[0],
				outputDuration: Duration[note[0]],
				time: () => this.to_time(Duration[note[0]]),
				inputFrequency: note[1],
				outputFrequency: Frequency[note[1]],
				index: i
			}
		})
	}

	/**
	* Output audio through an audio context, which closes after the last oscillator node ends, or on stop().
	*/
	play(n = 0) {
			const note = this.notesParsed[n]
			const stopTime = note.time(),
			oscillator = this.context.createOscillator()

			oscillator.connect(this.context.destination)
			oscillator.type = this.instrument
			oscillator.frequency.value = note.outputFrequency
			oscillator.start(0)
			oscillator.stop(this.context.currentTime + stopTime)

			oscillator.onended = () => {
				this.notesParsed[++n]
					? this.play(n)
					: this.ended()
			}
	}

	/**
	* Play through the composition in reverse.
	*/
	playReverse() {
		this.notesParsed.reverse()
		this.play()
	}

	/**
	* Repeat audio until stop() is called.
	*/
	playLoop() {
		this.loop = true
		this.play()
	}

	/**
	* Repeat audio in reverse until stop() is called.
	*/
	playReverseLoop() {
		this.loop = true
		this.playReverse()
	}

	/**
	* End looping and call ended().
	*/
	stop() {
		this.loop = false
		this.ended()
	}

	/**
	* End current audio loop.
	*/
	ended() {
		this.context.close().then(() => {
			this.create_context()
			this.loop
				? this.play()
				: this.parse_notes()
		})
	}

	/**
	* Get a summary of note pitch names from the composition.
	* @return {Array} Sorted note names at first octave.
	*/
	brief() {
		//find first octave of each note
		let origin = this.notesParsed.map(f => this.originFrequency(f.outputFrequency)),
		//eliminate duplicates
		notes = origin.filter((note, i) => i === origin.indexOf(note))
		//lowest to highest by frequency
	  	notes.sort()
		//frequencies to names
		let names = notes.map(note => note.inputFrequency)
		//return an array of all note pitch names that appear in the melody
		return names.filter(name => name && name !== 'rest')
	}

	/**
	* Get the length of the composition.
	* @return {number} Total time of composition in seconds.
	*/
	time() {
		let time = 0
		this.notesParsed.forEach(note => {
			time += note.time()
		})
		return time
	}

	/**
	* Get the same note in the first octave.
	* @param {number} frequency - Frequency of a note.
	* @return {number} Frequency of the same note in the first octave.
	*/
	originFrequency(freq) {
		let i = 1
		//notes in the first octave fall below 55Hz
		while (freq >= 55) {
			freq /= Math.pow(2, i)
			i += 1
		}
		return freq * 2
	}

	/**
	* Get the name of a note from its frequency.
	* @param {number} frequency - Frequency of a note.
	* @return {number} Name of the note.
	*/
	noteName(freq) {
		for (let key in Frequency) {
		    if (Frequency[key] === freq) {
				return key
		    }
		}
	}

	/**
	* Get the number of times each note appears in the composition.
	* @return {Object} Total count of each note.
	*/
	countNotes() {
		const count = {}

		this.notesParsed.forEach(note => {
			count[note.inputFrequency]
				? count[note.inputFrequency] = 0
				: count[note.inputFrequency] += 1
		})

		return count
	}
}

module.exports = Offbeat
