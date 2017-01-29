## Introduction  
Offbeat is a new format for music composition. Rather than staves, tabs, GUIs, or APIs, only the pitch and duration of notes are required to represent a composition. This won't produce high quality sound, but it will structure a composition as data. Combined with techniques from machine learning, it is possible to generate music categorically, e.g. genre, popularity, etc. And that is the aspiration of Offbeat, to be an intelligent tool for music generation and analysis.

The documentation below explains how it works.

### Note duration
A note's duration is the relative amount of time it is played, known as a subdivision. 
The names of common subdivisions are abbreviated as follows:

* ts = thirty-second  
* s = sixteenth  
* s-dot = dotted-sixteenth  
* t = triplet  
* e = eighth  
* e-dot = dotted-eighth    
* q = quarter  
* q-dot = dotted-quarter  
* h = half  
* h-dot = dotted-half   
* w = whole
* w-dot = dotted-whole   

_Note: 3 triplets = 2 eighths_

### Note pitch
D natural in the 5th octave is written as `d5`. Similarly, G-flat in the 3rd octave is `g_3`, 
and C-sharp in the 6th octave is `c#6`. A pitch can be between `a0` and `g#7`, inclusive.

### Putting duration and pitch together
General format: `[note_duration][space][note_pitch][comma]`   
In practice: `h d5, q g_3, q c#6` etc.

_Note: any amount of tabs, newlines, or whitespace can appear after the comma, but not between the duration and pitch_  

## Usage  
1) Import:
~~~
const Offbeat = require('Offbeat')
~~~
2) Pass in a melody object:  
~~~
const melody = new Offbeat({  
   tempo: 128,                                            //optional; default is 60
   instrument: 'square',                                  //optional; default is 'sine'
   timeSig: '3/4',                                        //optional; default is '4/4'
   notes: 't d4, t d_4, t d4, q a#5, q b5, q rest, w e4', //not optional; default is an empty string
   loop: true                                             //optional; default is false  
})
~~~
_Note: Up to six audio contexts can be active on the window object._

### Methods
__melody.update(obj)__  
Update current properties of an Offbeat instance.

__melody.play()__    
Output audio through a single audio context, which closes after the last oscillator node ends, or on stop().

__melody.playReverse()__  
Output audio in reverse.

__melody.playLoop()__  
Loop audio until .stop() is called.

__melody.playReverseLoop()__  
Loop audio in reverse until .stop() is called.

__melody.stop()__  
Close current audio context and ends looping.

__melody.time()__  
Calculate the duration of audio in seconds.

__melody.ended()__  
Closes current audio context and generates a new context.




