module.exports = {
  gain: (codebeat, val=100) => {
    codebeat.gainNode.gain.value = +val/100;
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
    function createReverbBuffer() {
      val = val.split('/')
      let rate = codebeat.context.sampleRate
      let channels = val[0] || 2
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

    codebeat.convolverNode.buffer = createReverbBuffer();
  }
}