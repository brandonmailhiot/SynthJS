function createReverbBuffer(synthjs, val) {
  val = val.split('/')
  let rate = synthjs.context.sampleRate
  let channels = val[0] || 1
  let length = rate * (val[1] || 1)
  let decay = val[2] || 0.5
  let buffer = synthjs.context.createBuffer(channels, length, rate)
  for (let c = 0; c < channels; c++) {
    let channelData = buffer.getChannelData(c)
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer
}

function makeDistortionCurve(val) {
  var v = +val,
  n_samples = 44100,
  curve = new Float32Array(n_samples),
  deg = Math.PI / 180,
  i = 0,
  x;
  for ( ; i < n_samples; ++i ) {
    x = i * 2 / n_samples - 1;
    curve[i] = (3 + v) * x * 20 * deg / (Math.PI + v * Math.abs(x));
  }
  return curve;
};

module.exports = {
  createReverbBuffer,
  gain: (synthjs, val=100) => {
    var gainNode = synthjs.context.createGain();
    gainNode.gain.value = +val/100;
    gainNode.connect(synthjs.lastNode);
    synthjs.lastNode = gainNode;
  },
  instrument: (synthjs, val) => {
    if (!val) return synthjs.instrument;
    synthjs.instrument = val;
  },
  detune: (synthjs, val) => {
    if (!val) return synthjs.detune;
    synthjs.detune = +val;
  },
  reverb: (synthjs, val) => {   
    var convolverNode = synthjs.context.createConvolver();
    convolverNode.buffer = createReverbBuffer(synthjs, val);
    convolverNode.connect(synthjs.lastNode);
    synthjs.lastNode = convolverNode;
  },
  distortion: (synthjs, val) => {
    val = val.split('/');
    var distortionNode = synthjs.context.createWaveShaper();
    distortionNode.curve = makeDistortionCurve(val[0]);
    distortionNode.oversample = val[1];
    distortionNode.connect(synthjs.lastNode);
    synthjs.lastNode = distortionNode;
  },
}