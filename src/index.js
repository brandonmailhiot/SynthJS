const Codebeat = require('./Codebeat');

const starwarsMelody =
`first = h c4, h g4;
second = t f4, t e4, t d4;
third = h c5, q g4, t f4, t e4, t f4;

t g3 * 3,
first, second,
h c5, q g4,
second, third,
h d4`;

const ghostbustersMelody =
`first = s c4 * 2, e e4, e c4, e d4, e b_3;
second = q rest * 2, s c4 * 4, e b_3;

first, second,
e c4, h rest,

first, second,
e d4, q c4`;

const harrypotterMelody =
`first = e. e4, s g4 - e f#4;

e b3,
first,
e. e4, s e4 - e b4,
q. a4,

q. f#4,
first,
q d#4, e f4,
q. b3`;

const starwars = new Codebeat({
  tempo: 120,
  notes: starwarsMelody,
});

const ghostbusters = new Codebeat({
  tempo: 116,
  notes: ghostbustersMelody,
});

const harrypotter = new Codebeat({
  tempo: 60,
  timeSig: '3/8',
  notes: harrypotterMelody,
});

$('#starwars .play-btn').click(() => { starwars.play() });
$('#ghostbusters .play-btn').click(() => { ghostbusters.play() });
$('#harrypotter .play-btn').click(() => { harrypotter.play() });

$('#starwars .playLoop-btn').click(() => { starwars.playLoop() });
$('#ghostbusters .playLoop-btn').click(() => { ghostbusters.playLoop() });
$('#harrypotter .playLoop-btn').click(() => { harrypotter.playLoop() });

$('#starwars .reverse-btn').click(() => { starwars.playReverse() });
$('#ghostbusters .reverse-btn').click(() => { ghostbusters.playReverse() });
$('#harrypotter .reverse-btn').click(() => { harrypotter.playReverse() });

$('#starwars .stop-btn').click(() => { starwars.stop() });
$('#ghostbusters .stop-btn').click(() => { ghostbusters.stop() });
$('#harrypotter .stop-btn').click(() => { harrypotter.stop() });

$('#starwars .composition').text(starwarsMelody);
$('#ghostbusters .composition').text(ghostbustersMelody);
$('#harrypotter .composition').text(harrypotterMelody);

$('#starwars .time').html(`<strong>Time:</strong> ${starwars.time().toFixed(2)} seconds`);
$('#ghostbusters .time').html(`<strong>Time:</strong> ${ghostbusters.time().toFixed(2)} seconds`);
$('#harrypotter .time').html(`<strong>Time:</strong> ${harrypotter.time().toFixed(2)} seconds`);

const tryItOptions = () => {
  return {
    tempo: +$('#try-it .tempo').val() || 60,
    timeSig: $('#try-it .timeSig').val() || '4/4',
    instrument: $('#try-it .instrument').val() || 'sine',
    notes: $('#try-it .composition').text(),
  };
};

const tryIt = new Codebeat(tryItOptions());

$('#try-it .play-btn').click(() => {
  tryIt.update(tryItOptions());
  tryIt.play();
  $('#try-it .time').html('<strong>Time:</strong> ' + tryIt.time().toFixed(2) + ' seconds');
});

$('#try-it .playLoop-btn').click(() => {
  tryIt.update(tryItOptions());
  tryIt.playLoop();
  $('#try-it .time').html(`<strong>Time:</strong> ${tryIt.time().toFixed(2)} seconds`);
})

$('#try-it .reverse-btn').click(() => {
  tryIt.update(tryItOptions());
  tryIt.playReverse();
  $('#try-it .time').html(`<strong>Time:</strong> ${tryIt.time().toFixed(2)} seconds`);
})

$('#try-it .stop-btn').click(() => {
  tryIt.stop();
  $('#try-it .time').html(`<strong>Time:</strong> ${tryIt.time().toFixed(2)} seconds`);
})
