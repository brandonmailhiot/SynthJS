# Offbeat
Create melodies quickly with the Web Audio API.

## Syntax
First, create a melody object.
~~~
let melody = {  
   bpm: 128,                                              //default is 60
   instrument: 'square',                                  //default is 'sine'
   timeSig: 1,                                            //default is 1
   notes: 't d4, t d_4, t d4, q a#5, q b5, q rest, w e4'  //default is an empty string
}
~~~
All properties are optional, since they each have defaults. However, the `notes` property is highly recommended.
Next, pass the melody object to Offbeat's `play` method.
~~~
Offbeat.play(melody)
~~~
This loads the declared properties and executes the composition accordingly.

### Note duration
A note's duration is the relative amount of time it is played, known as a subdivision. 
The names of common subdivisions are abbreviated as follows:

* ts = thirty-second  
* s = sixteenth  
* t = triplet  
* e = eighth  
* q = quarter  
* h = half  
* w = whole

_Note: 3 triplets = 2 eighths_

### Note pitch
The pitch of a note is its frequency. Note names are A, B, C, D, E, F, and G, which can be natural, sharp, or flat. 
These notes are repeated across several octaves. In Offbeat, D natural in the 5th octave is written as `d5`. Similarly,
G-flat in the 3rd octave is `g_3`, and C-sharp in the 6th octave is `c#6`.

### Putting duration and pitch together
General format: `[note_duration][space][note_pitch][comma][space]`   
In practice: `h d5, q g_3, q c#6` etc. 
