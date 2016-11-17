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
