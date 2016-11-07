# Offbeat
Create melodies quickly with the Web Audio API. Try it here: https://blmgeo.github.io/Offbeat/

## Introduction  
### Note duration
A note's duration is the relative amount of time it is played, known as a subdivision. 
The names of common subdivisions are abbreviated in Offbeat as follows:

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
General format: `[note_duration][space][note_pitch][comma]`   
In practice: `h d5, q g_3, q c#6` etc.

_Note: any amount of tabs, newlines, or whitespace can appear after the comma, but not between the duration and pitch_  

## Syntax
A melody object has `tempo`, `instrument`, `timeSig`, and `notes` properties.
~~~
let melody = {  
   tempo: 128,                                            //optional; default is 60
   instrument: 'square',                                  //optional; default is 'sine'
   timeSig: 3/4,                                          //optional; default is 4/4
   notes: 't d4, t d_4, t d4, q a#5, q b5, q rest, w e4'  //not optional; default is an empty string
}
~~~
### Offbeat.play(melody)  
__Input:__ melody object  
__Return:__ no return value  

Output audio through a single hardware audio context, which closes after the last oscillator node ends.

### Offbeat.time(melody)  
__Input:__ melody object  
__Return:__ float

Calculate the duration of audio in seconds.

### Offbeat.layer(melody)  
__Input:__ melody object (optional)  
__Return:__ melody object  

Get the default melody object. If a melody object is provided, it will be merged with the default.
