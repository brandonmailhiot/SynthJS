const Frequency = require('./frequency');
const Duration = require('./duration');
const Note = require('./note');
const FX = require('./fx');

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
    this.convolverNode = this.context.createConvolver();
    this.gainNode = this.context.createGain();
    this.convolverNode.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);

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
    if (props.notes) this.parseNotes();
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
    return this.beatsPerMeasure;
  }

  /**
  * Open an audio context.
  * @param {string} nodeContext - Required for node web audio API (used for testing).
  */
  createContext(nodeContext) {
    this.context = new (nodeContext || global.AudioContext || global.webkitAudioContext)();
    this.convolverNode = this.context.createConvolver();
    this.gainNode = this.context.createGain();
    this.convolverNode.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);
  }

  /**
  * Parse this.notes into an array of note objects.
  */
  parseNotes(notes = this.notes) {
    // prepare variable names for notes delimiter=;
    notes = Codebeat._expandMotifs(notes);

    // prepare note multiples delimiter=*
    notes = Codebeat._expandMultiples(notes);

    // prepare note slides delimiter=-
    notes = Codebeat._expandSlides(notes);

    // prepare chords delimiter=+
    notes = Codebeat._expandPoly(notes);

    // translate data to Note object delimiter=,
    notes = Codebeat._expandNotes(notes);

    // update or reset notesParsed
    this.notesParsed = notes;

    return this.notesParsed
  }

  /**
  * Output audio through an audio context, which closes after
  * the last oscillator node ends, or on stop().
  */
  play(n = 0) {
    const note = this.notesParsed[n];
    const nextNote = this.notesParsed[n + 1];
    const stopTime = this.toTime(note.outputDuration);
    const oscillators = [];
    const playNext = () => {
      n < this.notesParsed.length - 1
        ? this.play(n += 1)
        : this.ended();
    }

    if (note.fx[0]) {
      if (note.fx[0].indexOf('@') === 0) {
        FX[note.fx[0].slice(1)](this, note.value);
        return playNext();
      }
    }

    // create and configure oscillators
    note.outputFrequency.forEach(f => {
      let o = this.context.createOscillator();
      o.connect(this.convolverNode)
      // set instrument
      o.type = this.instrument;
      // set detune
      o.detune.setValueAtTime(this.detune || 0, this.context.currentTime);
      // set note frequency
      o.frequency.value = f;
      oscillators.push(o);
    });

    oscillators.forEach(o => {
      o.start(0);
      if (nextNote && note.fx.includes('slide')) this.slideNote(o, n)
      o.stop(this.context.currentTime + stopTime);
    })

    oscillators.shift().onended = () => {
      playNext()
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
    //TODO: Brief chords as well
    const singleNotes = this.notesParsed.filter(n => !n.fx.includes('poly'))
    const origin = this.notesParsed.map(f => Codebeat._originFrequency(f.outputFrequency[0]));
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

  squeeze(octave) {
    if (octave < Frequency.range[0] || octave > Frequency.range[1]) {
      return new Error("Error: octave out of range.")
    }

    this.notesParsed = this.notesParsed.map(n => {
      n.outputFrequency = n.outputFrequency.map(f => {
        let o = octave
        const origin = Codebeat._originFrequency(f)

        if (Codebeat._noteName(origin).match(/g|f|e|c|d/)) {
          o -= 1
        }

        return origin * Math.pow(2, o)
      })

      return n
    })
  }

  findKey() {
    //train model with .brief() data and classifier
  }

  generate() {
    
  }

  /**
  * Get the same note in the first octave.
  * @param {number} frequency - Frequency of a note in Hz.
  * @return {number} Frequency of the same note in the first octave.
  */
  static _originFrequency(f) {
    const note = Codebeat._noteName(f)
    const origin = note.slice(0, note.length - 1) + '1'
    const originFrequency = Frequency[origin]
    return originFrequency >= 55 
           ? originFrequency / 2 
           : originFrequency
  }

  /**
  * Get the name of a note from its frequency.
  * @param {number} frequency - Frequency of a note.
  * @return {number} Name of the note.
  */
  static _noteName(f) {
    let note = '';
    Object.keys(Frequency).forEach((key) => {
      if (Frequency[key] == f) {
        note = key
      }
    });
    return note || new Error('Error: note does not exist');
  }

  static _expandMotifs(notes) {
      const motifs = {};

      if (notes.includes(';')) {
        notes = notes.split(';');
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

    static _expandMultiples(notes) {
      const multiply = {
        occursAt: [],
        augment: 0,
      };

      notes.forEach((n, i) => {
        if (n.includes('*')) {
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

      return notes
    }

    static _expandSlides(notes) {
      const slide = {
        occursAt: [],
        augment: 0,
      };

      notes.forEach((n, i) => {
        if (n.includes('-')) {
          slide.occursAt.push(i);
        }
      });

      slide.occursAt.forEach((i) => {
        const index = i + slide.augment;
        let s = notes.splice(index, 1);
        notes.splice(index, 0, [s[0][0], s[0][1], ['slide']], [s[0][3], s[0][4], ['slide']])
        slide.augment += 1;
      });

      return notes;
    }

    static _expandPoly(notes) {
      notes = notes.map((n, i) => {
        if (n.includes('+')) {
          const duration = n.shift()
          const pitch = n.filter(p => p != '+')
                         .reduce((a,b) => a.concat(' ').concat(b))

          const poly = [
            duration,
            pitch,
            ['poly']
          ];

          n = poly;
        }
        return n;
      });

      return notes;
    }

    static _expandNotes(notes) {
      return notes.map((n, i) => {
        return Note(n)
      });
    }

    slideNote(oscillator, n) {
      const nextNote = this.notesParsed[n + 1];
      if (!nextNote.fx.includes('slide')) return

      const note = this.notesParsed[n];
      let output = note.outputFrequency[0];
      const nextOutput = nextNote.outputFrequency[0];
      const timeInterval = this.toTime(note.outputDuration) / Math.abs(nextOutput - output) * 1000;
      
      let slide = setInterval(() => {
        oscillator.frequency.value = output;
        if (output < nextOutput) {
          output += 1;
        }  else if (output > nextOutput) {
          output -= 1;
        } else clearInterval(slide);
      }, timeInterval)
    }
}

module.exports = Codebeat;
