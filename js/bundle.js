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

starwars = Offbeat.layer({
  tempo: 120,
  notes: starwars_melody
}),

ghostbusters = Offbeat.layer({
  tempo: 116,
  instrument: 'triangle',
  notes: ghostbusters_melody
})

harrypotter = Offbeat.layer({
  tempo: 60,
  timeSig: '3/8',
  instrument: 'square',
  notes: harrypotter_melody
})

$('#starwars .play-btn').click(() => { starwars.play() })
$('#ghostbusters .play-btn').click(() => { ghostbusters.play() })
$('#harrypotter .play-btn').click(() => { harrypotter.play() })

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

function customOffbeatLayer () {
  const tempo = +$('#try-it .tempo').val()       || 60,
  timeSig     = $('#try-it .timeSig').val()      || '4/4',
  instrument  = $('#try-it .instrument').val()   || 'sine',
  notes       = $('#try-it .composition').text() || '',
  tryIt = Offbeat.layer({
    tempo: tempo,
    timeSig: timeSig,
    instrument: instrument,
    notes: notes
  })
  $('#try-it .stop-btn').click(() => { tryIt.stop() })
  $('#try-it .time').html('<strong>Time:</strong> ' + tryIt.time().toFixed(2) + ' seconds')
}

$('#try-it .play-btn').click(() => {
  customOffbeatLayer()
  tryIt.play()


})

$('#try-it .reverse-btn').click(() => {
  customOffbeatLayer()
  tryIt.playReverse()


})

},{"../lib/Offbeat.js":2}],2:[function(require,module,exports){
'use strict'
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
aflat = gsharp,

frequency = {
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
}, //end note_data object

duration = {
	'ts': 0.03125, //thirty-second
	's': 0.0625, //sixteenth
	's-dot': 0.0625 + 0.03125, //dotted sixteenth
	't': 0.08333,  //eighth-note triplet
	'e': 0.125, //eighth
	'e-dot': 0.125 + 0.0625, //dotted eighth
	'q': 0.25, //quarter
	'q-dot': 0.25 + 0.125, //dotted quarter
	'h': 0.5, //half
	'h-dot': 0.5 + 0.25, //dotted half
	'w': 1, //whole
	'w-dot': 1 + 0.5 //dotted whole
},

Offbeat = {

	parse_notes(notes) {
		return notes.split(',').map(note => note.trim().split(' '))
	},

	generate_audio(context, index) {
		const oscillator = context.createOscillator(),
		stopTime = this.calculate_time( duration[this.notesParsed[index][0]] ),
		pitch = frequency[this.notesParsed[index][1]]

		oscillator.connect(context.destination)
		oscillator.type = this.instrument
		oscillator.frequency.value = pitch
		oscillator.start(0)
		oscillator.stop(context.currentTime + stopTime)

		oscillator.onended = () => {
			if (index < this.notesParsed.length - 1 && !this.isStopped) {
				index += 1
				this.generate_audio(context, index)
			}
			else context.close()
		}
	},

	calculate_time(duration) {
		return (duration * this.beatsPerMeasure) / (this.tempo / 60)
	},

	layer(options) {
		const layer = {
			tempo: 60,
			timeSig: '4/4',
			instrument: 'sine',
			notes: ''
		}

		if (options && typeof options === 'object') {
			for (let key in options) {
				if (layer.hasOwnProperty(key) && typeof layer[key] === typeof options[key]) {
					layer[key] = options[key]
				}
				else throw 'Property "' + key + '" is invalid'
			}
		}

		const instanceLayer = Object.assign(Object.create(this), layer)
		instanceLayer.beatsPerMeasure = parseInt(instanceLayer.timeSig, 10)
		instanceLayer.notesParsed = this.parse_notes(instanceLayer.notes)
		return instanceLayer
	},

	play() {
		if (this.notes === '') throw 'Property "notes" is invalid'
		const context = new (window.AudioContext || window.webkitAudioContext)()
		this.isStopped = false
		this.generate_audio(context, 0)
	},

	playReverse() {
		this.notesParsed.reverse()
		this.play()
		setTimeout(() => { this.notesParsed.reverse() }, this.time() * 1000)
	},

	stop() {
		this.isStopped = true
	},

	time() {
		if (this.notes === '') return 0
		let time = 0
		this.notesParsed.forEach(note => {
			time += this.calculate_time(duration[note[0]])
		})
		return time
	}
}

module.exports = Offbeat

},{}]},{},[1]);
