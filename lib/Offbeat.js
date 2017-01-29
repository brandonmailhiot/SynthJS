'use strict'
const frequency = require('./frequency'),
duration = require('./duration')

module.exports = class Offbeat {
	constructor(props) {
		this.tempo      = props.tempo || 60
		this.timeSig    = props.timeSig || '4/4'
		this.instrument = props.instrument || 'sine'
		this.notes      = props.notes || ''
		this.isLoop     = props.loop || false
    	this.create_context()
		this.parse_notes()
		this.get_bpm()
		this.reset_play_index()
		this.frequency = frequency
		this.duration = duration
	}

	//HELPER METHODS
	update(props) {
		Object.keys(props).forEach(key => {
			this[key] = props[key]
		})
		this.reset_play_index()
		this.parse_notes()
		this.get_bpm()
	}

	to_time(duration) {
		return (duration * this.beatsPerMeasure * 60) / this.tempo
	}

	get_bpm() {
		this.beatsPerMeasure = parseInt(this.timeSig, 10)
	}

	get_frequency(note) {
		return this.frequency[note[1]]
	}

	get_duration(note) {
		return this.duration[note[0]]
	}

	reset_play_index() {
		this.currentNote = 0
	}

	create_context() {
		this.context = new (window.AudioContext || window.webkitAudioContext)()
	}

	parse_notes() {
		const parse = n => { return n.trim().split(' ') },
		notesArray = this.notes.split(',')
		this.notesParsed = notesArray.map(note => parse(note))
	}

	//METHODS FOR PLAYING AUDIO
	play() {
		const oscillator = this.context.createOscillator(),
		note = this.notesParsed[this.currentNote],
		stopTime = this.to_time(this.get_duration(note)),
		pitch = this.get_frequency(note)

		oscillator.connect(this.context.destination)
		oscillator.type = this.instrument
		oscillator.frequency.value = pitch
		oscillator.start(0)
		oscillator.stop(this.context.currentTime + stopTime)

		oscillator.onended = () => {
			this.currentNote < this.notesParsed.length - 1 ?
			(this.currentNote++, this.play()) :
			this.ended()
		}
	}

	playReverse() {
		this.notesParsed.reverse()
		this.play()
	}

	playLoop() {
		this.isLoop = true
		this.play()
	}

	playReverseLoop() {
		this.isLoop = true
		this.playReverse()
	}

	stop() {
		this.isLoop = false
		this.ended()
	}

	ended() {
		this.context.close().then(() => {
			this.reset_play_index()
			this.create_context()
			this.isLoop ?
			this.play() :
			this.parse_notes()
		})
	}

	//METHODS FOR ANALYSIS
	sumKey() {
		//get array of notes as frequencies
		let freq = this.notesParsed.map(note => this.get_frequency(note)),
		//find the first octave of each note
		origin = freq.map(f => this.getOriginFrequency(f)),
		//eliminate duplicate notes
		notes = origin.filter((note, i) => i === origin.indexOf(note))
		//order from lowest to highest frequency
	  	notes.sort()
		//transform note frequencies into names without octave
		let names = notes.map(note => this.getNoteName(note))
		//return an array of all note names that appear in the melody
		return names.filter(name => name && name !== 'rest')
	}

	time() {
		let time = 0
		if (this.notes) {
			this.notesParsed.forEach(note => {
				time += this.to_time(this.get_duration(note))
			})
		}
		return time
	}

	//Origin refers to the same note in the lowest possible octave
	getOriginFrequency(freq) {
		let i = 0
		//notes in the first octave fall below 56Hz
		while (freq >= 56) {
			freq /= Math.pow(2, i)
			i += 1
		}
		return freq
	}

	getNoteName(freq) {
		for (var key in this.frequency) {
		    if (this.frequency[key] === freq) {
				return key
		    }
		}
	}

	countNotes() {
		let notes = this.notesParsed,
		count = {}
		for(let note of notes) {
			if(!count[note[1]]) {
				count[note[1]] = 0
			}
			count[note[1]] += 1
		}
		return count
	}
/*
	//METHODS INVOLVING DATA
	keyData() {
		return ['a', 'b', 'c', 'd', 'e', 'f', 'g']
	}

	queryKey() {
		let compNotes = this.sumKey(),
		data = this.keyData(),
		isKey = false
		for (let note in compNotes) {
			isKey = data.indexOf(note) ? true : false
		}
		if(isKey) {
			return 'c major'
		}
		else return false
	}
*/
}
