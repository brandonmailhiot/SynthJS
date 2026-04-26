function createReverbBuffer(synthjs, val) {
  let values = val.split('/');
  let rate = synthjs.context.sampleRate;
  let channels = values[0] || 1;
  let length = rate * (values[1] || 1);
  let decay = values[2] || 0.5;
  let buffer = synthjs.context.createBuffer(channels, length, rate);

  for (let c = 0; c < channels; c++) {
    let channelData = buffer.getChannelData(c);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  return buffer;
}

function makeDistortionCurve(val) {
  let v = +val;
  let n_samples = 44100;
  let curve = new Float32Array(n_samples);
  let deg = Math.PI / 180;
  let x;

  for (let i = 0; i < n_samples; ++i ) {
    x = i * 2 / n_samples - 1;
    curve[i] = (3 + v) * x * 20 * deg / (Math.PI + v * Math.abs(x));
  }

  return curve;
}

exports.createReverbBuffer = createReverbBuffer;
exports.makeDistortionCurve = makeDistortionCurve;

exports.gain = (synthjs, val=100) => {
  const gainNode = synthjs.context.createGain();
  gainNode.gain.value = +val / 100;
  gainNode.connect(synthjs.lastNode);
  synthjs.lastNode = gainNode;
};

exports.instrument = (synthjs, val) => {
  if (!val) return synthjs.instrument;
  synthjs.instrument = val;
};

exports.detune = (synthjs, val) => {
  if (!val) return synthjs.detune;
  synthjs.detune = +val;
};

exports.reverb = (synthjs, val) => {   
  const convolverNode = synthjs.context.createConvolver();
  convolverNode.buffer = createReverbBuffer(synthjs, val);
  convolverNode.connect(synthjs.lastNode);
  synthjs.lastNode = convolverNode;
};

exports.distortion = (synthjs, val) => {
  let values = val.split('/');
  const distortionNode = synthjs.context.createWaveShaper();
  distortionNode.curve = makeDistortionCurve(values[0]);
  distortionNode.oversample = values[1];
  distortionNode.connect(synthjs.lastNode);
  synthjs.lastNode = distortionNode;
};