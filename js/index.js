let starwars_melody =
`t g3, t g3, t g3,
h c4, h g4,

t f4, t e4, t d4,
h c5, q g4,

t f4, t e4, t d4,
h c5, q g4,

t f4, t e4, t f4,
h d4`

let ghostbusters_melody =
`s c4, s c4, e e4, e c4, e d4, e b_3,
q rest, q rest,
s c4, s c4, s c4, s c4,
e b_3, e c4, q rest,

s c4, s c4, e e4, e c4, e d4, e b_3,
q rest, q rest,
s c4, s c4, s c4, s c4,
e b_3, e d4, q c4`

const starwars = {
  tempo: 132,
  notes: starwars_melody
}

const ghostbusters = {
  tempo: 120,
  notes: ghostbusters_melody
}

const starwars_time = Offbeat.time(starwars)
const ghostbusters_time = Offbeat.time(ghostbusters)

document.querySelector('#starwars button.play-btn').addEventListener('click', () => {
  Offbeat.play(starwars)
})

document.querySelector('#ghostbusters button.play-btn').addEventListener('click', () => {
  Offbeat.play(ghostbusters)
})

document.querySelector('#starwars textarea').value = starwars_melody
document.querySelector('#ghostbusters textarea').value = ghostbusters_melody
document.querySelector('#starwars p.time').innerHTML = '<strong>Time:</strong> ' + starwars_time.toFixed(2) + ' seconds'
document.querySelector('#ghostbusters p.time').innerHTML = '<strong>Time:</strong> ' + ghostbusters_time.toFixed(2) + ' seconds'
