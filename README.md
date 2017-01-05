# Offbeat
Create melodies quickly with an efficient syntax. Try it here: https://blmgeo.github.io/Offbeat/

## Introduction  
### Note duration
A note's duration is the relative amount of time it is played, known as a subdivision. 
The names of common subdivisions are abbreviated in Offbeat as follows:

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
In Offbeat, D natural in the 5th octave is written as `d5`. Similarly, G-flat in the 3rd octave is `g_3`, 
and C-sharp in the 6th octave is `c#6`. A pitch can be between `a0` and `g#7`, inclusive.

### Putting duration and pitch together
General format: `[note_duration][space][note_pitch][comma]`   
In practice: `h d5, q g_3, q c#6` etc.

_Note: any amount of tabs, newlines, or whitespace can appear after the comma, but not between the duration and pitch_  

## Usage  
1) Import the Offbeat library:
~~~
const Offbeat = require('Offbeat')
~~~
2) Create a melody object:  
~~~
const melody = {  
   tempo: 128,                                            //optional; default is 60
   instrument: 'square',                                  //optional; default is 'sine'
   timeSig: '3/4',                                        //optional; default is '4/4'
   notes: 't d4, t d_4, t d4, q a#5, q b5, q rest, w e4'  //not optional; default is an empty string
}
~~~
3) Pass the melody object to Offbeat's .layer() method to create an instance of the library:
~~~
const layer = Offbeat.layer(melody) 
~~~

### Methods
__Offbeat.layer(melody)__  
Create an instance of Offbeat. Object properties are set to default if a melody object is not provided.  

__layerInstance.update(melody)__  
Update current instance of Offbeat.

__layerInstance.play()__    
Output audio through a single audio context, which closes after the last oscillator node ends.

__layerInstance.playReverse()__  
Output audio in reverse.

__layerInstance.playLoop()__  
Loop audio until .stop() is called.

__layerInstance.playReverseLoop()__  
Loop audio in reverse until .stop() is called.

__layerInstance.stop()__  
Close current audio context and end looping.

__layerInstance.time()__  
Calculate the duration of audio in seconds.

__layerInstance.ended()__  
Ends current audio loop.


