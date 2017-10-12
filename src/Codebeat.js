const Frequency = require('./frequency');
const Duration = require('./duration');

class Codebeat {
  /**
  * Create an instance of Codebeat.
  * @constructor
  * @param {Object} props - Initialize with tempo, timeSig, instrument, notes, and loop properties.
  */
  constructor(props) {
    this.tempo = props.tempo || 60;
    this.timeSig = props.timeSig || '4/4';
    this.instrument = props.instrument || 'sine';
    this.notes = props.notes || '';
    this.loop = props.loop || false;
    this.context = new (props.context || global.AudioContext || global.webkitAudioContext)();
    this.parseNotes();
    this.getBPM();
  }

  /**
  * Update current properties.
  * @param {Object} props - Update the tempo, timeSig, instrument, notes, and/or loop properties.
  */
  update(props) {
    Object.keys(props).forEach((key) => {
      this[key] = props[key];
    });
    this.parseNotes();
    if (props.timeSig) this.getBPM();
  }

  /**
  * Calculate duration in seconds.
  * @param {number} duration - Note duration relative to one measure.
  * @return {number} Time of duration in seconds.
  */
  toTime(duration) {
    return (duration * this.beatsPerMeasure * 60) / this.tempo;
  }

  /**
  * Get the number of beats per measure based on the timeSig property numerator.
  * Called on initialization or update().
  */
  getBPM() {
    this.beatsPerMeasure = parseInt(this.timeSig, 10);
  }

  /**
  * Open an audio context.
  * @param {string} nodeContext - Required for node web audio API (used for testing).
  */
  createContext(nodeContext) {
    this.context = new (nodeContext || global.AudioContext || global.webkitAudioContext)();
  }

  /**
  * Parse this.notes into an array of note objects.
  */
  parseNotes(notes = this.notes) {
    notes = Codebeat._expandMotifs(notes);
    notes = Codebeat._expandMultiples(notes);
    this.notesParsed = Codebeat._expandNotes(notes);
  }

  /**
  * Output audio through an audio context, which closes after
  * the last oscillator node ends, or on stop().
  */
  play(n = 0) {
    const note = this.notesParsed[n];
    const stopTime = this.toTime(note.outputDuration);
    const oscillator = this.context.createOscillator();

    oscillator.connect(this.context.destination);
    oscillator.type = this.instrument;
    oscillator.frequency.value = note.outputFrequency;
    oscillator.start(0);
    oscillator.stop(this.context.currentTime + stopTime);

    oscillator.onended = () => {
      this.notesParsed[n + 1] 
      ? this.play(n += 1)
      : this.ended();
    };
  }

  /**
  * Play through the composition in reverse.
  */
  playReverse() {
    this.notesParsed.reverse();
    this.play();
  }

  /**
  * Repeat audio until stop() is called.
  */
  playLoop() {
    this.loop = true;
    this.play();
  }

  /**
  * Repeat audio in reverse until stop() is called.
  */
  playReverseLoop() {
    this.loop = true;
    this.playReverse();
  }

  /**
  * End looping and call ended().
  */
  stop() {
    this.loop = false;
    this.ended();
  }

  /**
  * End current audio loop.
  */
  ended() {
    this.context.close().then(() => {
      this.createContext();
      if (this.loop) this.play();
      else this.parseNotes();
    });
  }

  /**
  * Get a summary of note pitch names from the composition.
  * @return {Array} Sorted note names at first octave.
  */
  brief() {
    const origin = this.notesParsed.map(f => Codebeat._originFrequency(f.outputFrequency));
    const notes = origin.filter((note, i) => i === origin.indexOf(note));
    notes.sort();
    const names = notes.map(note => Codebeat._noteName(note));
    return names.filter(name => name && name !== 'rest');
  }

  /**
  * Get the length of the composition.
  * @return {number} Total time of composition in seconds.
  */
  time() {
    let time = 0;
    this.notesParsed.forEach((note) => {
      time += this.toTime(note.outputDuration) || 0;
    });
    return time;
  }

  /**
  * Get the number of times each note appears in the composition.
  * @return {Object} Total count of each note.
  */
  countNotes() {
    const count = {};
    this.notesParsed.forEach((note) => {
      if (!count[note.inputFrequency]) {
        count[note.inputFrequency] = 0;
      }
      if (count[note.inputFrequency] >= 0) {
        count[note.inputFrequency] += 1;
      }
    });
    return count;
  }

  /**
  * Get the same note in the first octave.
  * @param {number} frequency - Frequency of a note in Hz.
  * @return {number} Frequency of the same note in the first octave.
  */
  static _originFrequency(f) {
    let frequency = f;
    let i = 1;
    // notes in the first octave fall below 55Hz
    while (frequency >= 55) {
      frequency /= Math.pow(2, i);
      i += 1;
    }
    return frequency * 2;
  }

  /**
  * Get the name of a note from its frequency.
  * @param {number} frequency - Frequency of a note.
  * @return {number} Name of the note.
  */
  static _noteName(freq) {
    let note = '';
    Object.keys(Frequency).forEach((key) => {
      if (Frequency[key] === freq) note = key;
    });
    return note || new Error('Note does not exist');
  }

  static _expandMotifs(notes, delimiter = ';') {
      const motifs = {};

      if (notes.includes(delimiter)) {
        notes = notes.split(delimiter);
        const motifOccursAt = [];
        const operator = '=';

        notes.forEach((n, i) => {
          if (n.includes(operator)) {
            const motif = n.split(operator).map(m => m.trim());
            motifs[motif[0]] = motif[1];
            motifOccursAt.push(i);
          }
        });

        notes = notes
          .filter((n, i) => !motifOccursAt.includes(i))
          .reduce((a, b) => a.concat(`,${b}`))
          .split(',')
          .map(n => n.trim())
          .map(n => (Object.prototype.hasOwnProperty.call(motifs, n) ? motifs[n] : n))
          .join(',');
      }

      return notes.split(',').map(n => n.trim().split(' '));
    }

    static _expandMultiples(notes, delimiter = '*') {
      const multiply = {
        occursAt: [],
        augment: 0,
      };

      notes.forEach((n, i) => {
        if (n.includes(delimiter)) {
          multiply.occursAt.push(i);
        }
      });

      multiply.occursAt.forEach((i) => {
        const index = i + multiply.augment;
        const note = notes[index];
        for (let j = 1; j < note[3]; j += 1) {
          notes.splice(index + 1, 0, [note[0], note[1]]);
          multiply.augment += 1;
        }
      });

      return notes;
    }

    static _expandNotes(notes) {
      return notes.map((note, i) => {
        const inputDuration = note[0];
        const inputFrequency = note[1];
        return {
          inputDuration,
          inputFrequency,
          outputDuration: Duration[inputDuration],
          outputFrequency: Frequency[inputFrequency],
          index: i,
        };
      });
    }
}

module.exports = Codebeat;
