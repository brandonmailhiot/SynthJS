(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const Offbeat = require('../lib/Offbeat.js'),

starwars_melody =
`t g3, t g3, t g3,
h c4, h g4,
t f4, t e4, t d4,
h c5, q g4,

t f4, t e4, t d4,
h c5, q g4,
t f4, t e4, t f4,
h d4`,

ghostbusters_melody =
`s c4, s c4, e e4, e c4, e d4, e b_3,
q rest, q rest,
s c4, s c4, s c4, s c4,
e b_3, e c4, q rest,

s c4, s c4, e e4, e c4, e d4, e b_3,
q rest, q rest,
s c4, s c4, s c4, s c4,
e b_3, e d4, q c4`,

harrypotter_melody =
`e b3,
e-dot e4, s g4, e f#4,
q e4, e b4,
q-dot a4,

q-dot f#4,
e-dot e4, s g4, e f#4,
q d#4, e f4,
q-dot b3
`,

starwars = new Offbeat({
  tempo: 120,
  notes: starwars_melody
}),

ghostbusters = new Offbeat({
  tempo: 116,
  notes: ghostbusters_melody
})

harrypotter = new Offbeat({
  tempo: 60,
  timeSig: '3/8',
  notes: harrypotter_melody
})

$('#starwars .play-btn').click(() => { starwars.play() })
$('#ghostbusters .play-btn').click(() => { ghostbusters.play() })
$('#harrypotter .play-btn').click(() => { harrypotter.play() })

$('#starwars .playLoop-btn').click(() => { starwars.playLoop() })
$('#ghostbusters .playLoop-btn').click(() => { ghostbusters.playLoop() })
$('#harrypotter .playLoop-btn').click(() => { harrypotter.playLoop() })

$('#starwars .reverse-btn').click(() => { starwars.playReverse() })
$('#ghostbusters .reverse-btn').click(() => { ghostbusters.playReverse() })
$('#harrypotter .reverse-btn').click(() => { harrypotter.playReverse() })

$('#starwars .stop-btn').click(() => { starwars.stop() })
$('#ghostbusters .stop-btn').click(() => { ghostbusters.stop() })
$('#harrypotter .stop-btn').click(() => { harrypotter.stop() })

$('#starwars .composition').text(starwars_melody)
$('#ghostbusters .composition').text(ghostbusters_melody)
$('#harrypotter .composition').text(harrypotter_melody)

$('#starwars .time').html('<strong>Time:</strong> ' + starwars.time().toFixed(2) + ' seconds')
$('#ghostbusters .time').html('<strong>Time:</strong> ' + ghostbusters.time().toFixed(2) + ' seconds')
$('#harrypotter .time').html('<strong>Time:</strong> ' + harrypotter.time().toFixed(2) + ' seconds')

const tryItOptions = () => {
  return {
    tempo: +$('#try-it .tempo').val() || 60,
    timeSig: $('#try-it .timeSig').val() || '4/4',
    instrument: $('#try-it .instrument').val() || 'sine',
    notes: $('#try-it .composition').text()
  }
}

const tryIt = new Offbeat(tryItOptions())

$('#try-it .play-btn').click(() => {
  tryIt.update(tryItOptions())
  tryIt.play()
  $('#try-it .time').html('<strong>Time:</strong> ' + tryIt.time().toFixed(2) + ' seconds')
})

$('#try-it .playLoop-btn').click(() => {
  tryIt.update(tryItOptions())
  tryIt.playLoop()
  $('#try-it .time').html('<strong>Time:</strong> ' + tryIt.time().toFixed(2) + ' seconds')
})

$('#try-it .reverse-btn').click(() => {
  tryIt.update(tryItOptions())
  tryIt.playReverse()
  $('#try-it .time').html('<strong>Time:</strong> ' + tryIt.time().toFixed(2) + ' seconds')
})

$('#try-it .stop-btn').click(() => {
  tryIt.stop()
  $('#try-it .time').html('<strong>Time:</strong> ' + tryIt.time().toFixed(2) + ' seconds')
})

},{"../lib/Offbeat.js":2}],2:[function(require,module,exports){
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

},{"./duration":3,"./frequency":4}],3:[function(require,module,exports){
//base duration of 1/32
const ts = 0.03125

module.exports = {
    'ts': ts, //thirty-second
    's': ts*2, //sixteenth
    's-dot': ts*3, //dotted sixteenth
    't': ts*(8/3),  //eighth-note triplet
    'e': ts*4, //eighth
    'e-dot': ts*6, //dotted eighth
    'q': ts*8, //quarter
    'q-dot': ts*12, //dotted quarter
    'h': ts*16, //half
    'h-dot': ts*24, //dotted half
    'w': ts*32, //whole
    'w-dot': ts*48 //dotted whole
}

},{}],4:[function(require,module,exports){
//base frequency for each note
const a = 27.5,
asharp = 29.1352,
b = 30.8677,
bflat = asharp,
c = 32.7032,
csharp = 34.6478,
d = 36.7081,
dflat = csharp,
dsharp = 38.8909,
e = 41.2034,
eflat = dsharp,
f = 43.6535,
fsharp = 46.2493,
g = 48.9994,
gflat = fsharp,
gsharp = 51.9131,
aflat = gsharp

module.exports = {
    'rest': 0.0,
    //naturals
    'a0': a,
    'a1': a*2,
    'a2': a*4,
    'a3': a*8,
    'a4': a*16,
    'a5': a*32,
    'a6': a*64,
    'a7': a*128,
    'b0': b,
    'b1': b*2,
    'b2': b*4,
    'b3': b*8,
    'b4': b*16,
    'b5': b*32,
    'b6': b*64,
    'b7': b*128,
    'c1': c,
    'c2': c*2,
    'c3': c*4,
    'c4': c*8,
    'c5': c*16,
    'c6': c*32,
    'c7': c*64,
    'c8': c*128,
    'd1': d,
    'd2': d*2,
    'd3': d*4,
    'd4': d*8,
    'd5': d*16,
    'd6': d*32,
    'd7': d*64,
    'e1': e,
    'e2': e*2,
    'e3': e*4,
    'e4': e*8,
    'e5': e*16,
    'e6': e*32,
    'e7': e*64,
    'f1': f,
    'f2': f*2,
    'f3': f*4,
    'f4': f*8,
    'f5': f*16,
    'f6': f*32,
    'f7': f*64,
    'g1': g,
    'g2': g*2,
    'g3': g*4,
    'g4': g*8,
    'g5': g*16,
    'g6': g*32,
    'g7': g*64,
    //sharps
    'a#0': asharp,
    'a#1': asharp*2,
    'a#2': asharp*4,
    'a#3': asharp*8,
    'a#4': asharp*16,
    'a#5': asharp*32,
    'a#6': asharp*64,
    'a#7': asharp*128,
    'c#1': csharp,
    'c#2': csharp*2,
    'c#3': csharp*4,
    'c#4': csharp*8,
    'c#5': csharp*16,
    'c#6': csharp*32,
    'c#7': csharp*64,
    'd#1': dsharp,
    'd#2': dsharp*2,
    'd#3': dsharp*4,
    'd#4': dsharp*8,
    'd#5': dsharp*16,
    'd#6': dsharp*32,
    'd#7': dsharp*64,
    'f#1': fsharp,
    'f#2': fsharp*2,
    'f#3': fsharp*4,
    'f#4': fsharp*8,
    'f#5': fsharp*16,
    'f#6': fsharp*32,
    'f#7': fsharp*64,
    'g#1': gsharp,
    'g#2': gsharp*2,
    'g#3': gsharp*4,
    'g#4': gsharp*8,
    'g#5': gsharp*16,
    'g#6': gsharp*32,
    'g#7': gsharp*64,
    //flats
    'a_1': aflat,
    'a_2': aflat*2,
    'a_3': aflat*4,
    'a_4': aflat*8,
    'a_5': aflat*16,
    'a_6': aflat*32,
    'a_7': aflat*64,
    'b_0': bflat,
    'b_1': bflat*2,
    'b_2': bflat*4,
    'b_3': bflat*8,
    'b_4': bflat*16,
    'b_5': bflat*32,
    'b_6': bflat*64,
    'b_7': bflat*128,
    'd_1': dflat,
    'd_2': dflat*2,
    'd_3': dflat*4,
    'd_4': dflat*8,
    'd_5': dflat*16,
    'd_6': dflat*32,
    'd_7': dflat*64,
    'e_1': eflat,
    'e_2': eflat*2,
    'e_3': eflat*4,
    'e_4': eflat*8,
    'e_5': eflat*16,
    'e_6': eflat*32,
    'e_7': eflat*64,
    'g_1': gflat,
    'g_2': gflat*2,
    'g_3': gflat*4,
    'g_4': gflat*8,
    'g_5': gflat*16,
    'g_6': gflat*32,
    'g_7': gflat*64
} //end note_data object

},{}]},{},[1]);
