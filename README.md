
# Introduction
Codebeat is a browser-based audio programming language for music composition and audio synthesis. [This](https://kebo.herokuapp.com) is an example application using the codebeat module.

# Usage  
Install:

~~~
npm install codebeat
~~~

Import and instantiate with voice config: 

~~~
import Codebeat from 'codebeat'

const melody = new Codebeat({  
   tempo: 128,                //default is 60
   instrument: 'square',      //default is 'sine'
   timeSig: '3/4',            //default is '4/4'
   loop: true                 //default is false  
})
~~~

Write and play:

~~~
melody.update({notes: `
  t d4, t d_4,
  t d4, q a#5,
  q b5, q rest
`})

melody.play()
~~~

_Note:_ Up to six audio contexts (voices) can be active on the window object. Each instance of Codebeat creates a new context.

## Note duration
A note's duration is the amount of time it is played relative to the tempo, known as a subdivision.
Common subdivisions are abbreviated as follows:

* z = zero (useful for slides where the end note is not held)
* ts = thirty-second  
* s = sixteenth  
* s. = dotted-sixteenth  
* t = triplet  
* e = eighth  
* e. = dotted-eighth    
* q = quarter  
* q. = dotted-quarter  
* h = half  
* h. = dotted-half   
* w = whole
* w. = dotted-whole
* i = indefinite (or 32,000 thirty-second notes to be clear)

_Note:_ 3 triplets = 2 eighths

## Note names
A note's name is mapped to its frequency in hertz. D in the 5th octave is written as `d5`. Similarly, G-flat in the 3rd octave is `g_3`, and C-sharp in the 6th octave is `c#6`. A note may be between `a0` and `g#7`, inclusive.

## Basic notation

### General format   
`h d5, q g_3, q c#6`
`[duration][space][note][comma]`

_Note:_ Any amount of tabs, newlines, or whitespace can appear after the comma, but one space must appear between the duration and pitch. 

### Repetition
To simplify the writing process, groups of notes may be assigned to variables (separated by semicolons).

~~~
motif = h d5, q g_3, q c#6;

t d4, motif,
t a4, motif
~~~

Repeated notes may be multiplied by an integer value.

~~~
h c4 * 8, t b_3 * 3
~~~

### Chords
Use the `+` operator to play notes simultaneously. A chord is constituted of its pitches played for a specified duration.

~~~
chord = h d3 + a3 + g3;

h d3, chord,
h a3, chord
~~~

### Slides
A note may be gradually altered over time until it reaches a new pitch. This is achieved with the `-` operator.

~~~
slide = h e2 - e c3;

e f3, slide,
h b3, slide
~~~

To chain slides, use the `z` duration for the destination note and following source note:

~~~
h e2 - z c3, h c3 - z f4, e f4 - z d3
~~~

This ensures that the entire duration of the slide is dictated by the duration of the source note.
