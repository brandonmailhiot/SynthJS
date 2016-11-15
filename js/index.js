const Offbeat = require('../lib/Offbeat.min.js'),

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
  notes: ghostbusters_melody
})

harrypotter = Offbeat.layer({
  tempo: 60,
  timeSig: '3/8',
  notes: harrypotter_melody
})

document.querySelector('#starwars button.play-btn').addEventListener('click', () => { starwars.play() })
document.querySelector('#ghostbusters button.play-btn').addEventListener('click', () => { ghostbusters.play() })
document.querySelector('#harrypotter button.play-btn').addEventListener('click', () => { harrypotter.play() })

document.querySelector('#starwars button.stop-btn').addEventListener('click', () => { starwars.stop() })
document.querySelector('#ghostbusters button.stop-btn').addEventListener('click', () => { ghostbusters.stop() })
document.querySelector('#harrypotter button.stop-btn').addEventListener('click', () => { harrypotter.stop() })

document.querySelector('#starwars .composition').innerHTML = starwars_melody
document.querySelector('#ghostbusters .composition').innerHTML = ghostbusters_melody
document.querySelector('#harrypotter .composition').innerHTML = harrypotter_melody

document.querySelector('#starwars p.time').innerHTML = '<strong>Time:</strong> ' + starwars.time().toFixed(2) + ' seconds'
document.querySelector('#ghostbusters p.time').innerHTML = '<strong>Time:</strong> ' + ghostbusters.time().toFixed(2) + ' seconds'
document.querySelector('#harrypotter p.time').innerHTML = '<strong>Time:</strong> ' + harrypotter.time().toFixed(2) + ' seconds'
