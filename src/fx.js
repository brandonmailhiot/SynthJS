function createReverbBuffer(codebeat, val) {
  val = val.split('/')
  let rate = codebeat.context.sampleRate
  let channels = val[0] || 1
  let length = rate * (val[1] || 1)
  let decay = val[2] || 0.5
  let buffer = codebeat.context.createBuffer(channels, length, rate)
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
  gain: (codebeat, val=100) => {
    var gainNode = codebeat.context.createGain();
    gainNode.gain.value = +val/100;
    gainNode.connect(codebeat.lastNode);
    codebeat.lastNode = gainNode;
  },
  instrument: (codebeat, val) => {
    if (!val) return codebeat.instrument;
    codebeat.instrument = val;
  },
  detune: (codebeat, val) => {
    if (!val) return codebeat.detune;
    codebeat.detune = +val;
  },
  reverb: (codebeat, val) => {   
    var convolverNode = codebeat.context.createConvolver();
    convolverNode.buffer = createReverbBuffer(codebeat, val);
    convolverNode.connect(codebeat.lastNode);
    codebeat.lastNode = convolverNode;
  },
  distortion: (codebeat, val) => {
    val = val.split('/');
    var distortionNode = codebeat.context.createWaveShaper();
    distortionNode.curve = makeDistortionCurve(val[0]);
    distortionNode.oversample = val[1];
    distortionNode.connect(codebeat.lastNode);
    codebeat.lastNode = distortionNode;
  },
}