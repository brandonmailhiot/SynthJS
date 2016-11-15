(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const Offbeat = require('../lib/Offbeat.min.js'),

starwars_melody =
`t g3, t g3, t g3,
h c4, h g4,

t f4, t e4, t d4,
h c5, q g4,

t f4, t e4, t d4,
h c5, q g4,

t f4, t e4, t f4,
h d4`,

ghostbusters_melody =
`s c4, s c4, e e4, e c4, e d4, e b_3,
q rest, q rest,
s c4, s c4, s c4, s c4,
e b_3, e c4, q rest,

s c4, s c4, e e4, e c4, e d4, e b_3,
q rest, q rest,
s c4, s c4, s c4, s c4,
e b_3, e d4, q c4`,

harrypotter_melody =
`e b3,
e-dot e4, s g4, e f#4,
q e4, e b4,
q-dot a4,

q-dot f#4,
e-dot e4, s g4, e f#4,
q d#4, e f4,
q-dot b3
`,

starwars = Offbeat.layer({
  tempo: 120,
  notes: starwars_melody
}),

ghostbusters = Offbeat.layer({
  tempo: 116,
  notes: ghostbusters_melody
})

harrypotter = Offbeat.layer({
  tempo: 60,
  timeSig: '3/8',
  notes: harrypotter_melody
})

document.querySelector('#starwars button.play-btn').addEventListener('click', () => { starwars.play() })
document.querySelector('#ghostbusters button.play-btn').addEventListener('click', () => { ghostbusters.play() })
document.querySelector('#harrypotter button.play-btn').addEventListener('click', () => { harrypotter.play() })

document.querySelector('#starwars button.stop-btn').addEventListener('click', () => { starwars.stop() })
document.querySelector('#ghostbusters button.stop-btn').addEventListener('click', () => { ghostbusters.stop() })
document.querySelector('#harrypotter button.stop-btn').addEventListener('click', () => { harrypotter.stop() })

document.querySelector('#starwars .composition').innerHTML = starwars_melody
document.querySelector('#ghostbusters .composition').innerHTML = ghostbusters_melody
document.querySelector('#harrypotter .composition').innerHTML = harrypotter_melody

document.querySelector('#starwars p.time').innerHTML = '<strong>Time:</strong> ' + starwars.time().toFixed(2) + ' seconds'
document.querySelector('#ghostbusters p.time').innerHTML = '<strong>Time:</strong> ' + ghostbusters.time().toFixed(2) + ' seconds'
document.querySelector('#harrypotter p.time').innerHTML = '<strong>Time:</strong> ' + harrypotter.time().toFixed(2) + ' seconds'

},{"../lib/Offbeat.min.js":2}],2:[function(require,module,exports){
var a=27.5,asharp=29.1352,b=30.8677,bflat=asharp,c=32.7032,csharp=34.6478,d=36.7081,dflat=csharp,dsharp=38.8909,e=41.2034,eflat=dsharp,f=43.6535,fsharp=46.2493,g=48.9994,gflat=fsharp,gsharp=51.9131,aflat=gsharp,frequency={rest:0,a0:a,a1:2*a,a2:4*a,a3:8*a,a4:16*a,a5:32*a,a6:64*a,a7:128*a,b0:b,b1:2*b,b2:4*b,b3:8*b,b4:16*b,b5:32*b,b6:64*b,b7:128*b,c1:c,c2:2*c,c3:4*c,c4:8*c,c5:16*c,c6:32*c,c7:64*c,c8:128*c,d1:d,d2:2*d,d3:4*d,d4:8*d,d5:16*d,d6:32*d,d7:64*d,e1:e,e2:2*e,e3:4*e,e4:8*e,e5:16*e,e6:32*e,e7:64*
e,f1:f,f2:2*f,f3:4*f,f4:8*f,f5:16*f,f6:32*f,f7:64*f,g1:g,g2:2*g,g3:4*g,g4:8*g,g5:16*g,g6:32*g,g7:64*g,"a#0":asharp,"a#1":2*asharp,"a#2":4*asharp,"a#3":8*asharp,"a#4":16*asharp,"a#5":32*asharp,"a#6":64*asharp,"a#7":128*asharp,"c#1":csharp,"c#2":2*csharp,"c#3":4*csharp,"c#4":8*csharp,"c#5":16*csharp,"c#6":32*csharp,"c#7":64*csharp,"d#1":dsharp,"d#2":2*dsharp,"d#3":4*dsharp,"d#4":8*dsharp,"d#5":16*dsharp,"d#6":32*dsharp,"d#7":64*dsharp,"f#1":fsharp,"f#2":2*fsharp,"f#3":4*fsharp,"f#4":8*fsharp,"f#5":16*
fsharp,"f#6":32*fsharp,"f#7":64*fsharp,"g#1":gsharp,"g#2":2*gsharp,"g#3":4*gsharp,"g#4":8*gsharp,"g#5":16*gsharp,"g#6":32*gsharp,"g#7":64*gsharp,a_1:aflat,a_2:2*aflat,a_3:4*aflat,a_4:8*aflat,a_5:16*aflat,a_6:32*aflat,a_7:64*aflat,b_0:bflat,b_1:2*bflat,b_2:4*bflat,b_3:8*bflat,b_4:16*bflat,b_5:32*bflat,b_6:64*bflat,b_7:128*bflat,d_1:dflat,d_2:2*dflat,d_3:4*dflat,d_4:8*dflat,d_5:16*dflat,d_6:32*dflat,d_7:64*dflat,e_1:eflat,e_2:2*eflat,e_3:4*eflat,e_4:8*eflat,e_5:16*eflat,e_6:32*eflat,e_7:64*eflat,g_1:gflat,
g_2:2*gflat,g_3:4*gflat,g_4:8*gflat,g_5:16*gflat,g_6:32*gflat,g_7:64*gflat},duration={ts:.03125,s:.0625,"s-dot":.09375,t:.08333,e:.125,"e-dot":.1875,q:.25,"q-dot":.375,h:.5,"h-dot":.75,w:1,"w-dot":1.5},Offbeat={parse_notes:function(){return this.notes.split(",").map(function(h){return h.trim().split(" ")})},get_time:function(h){return h*parseInt(this.timeSig,10)/(this.tempo/60)},layer:function(h){var k={tempo:60,timeSig:"4/4",instrument:"sine",notes:""};if(h)for(var l in h)if(k.hasOwnProperty(l))k[l]=
h[l];else throw'Property "'+l+'" does not exist';return Object.assign(Object.create(this),k)},generate_audio:function(h,k,l){var n=this,m=h.createOscillator(),p=this.get_time(duration[k[l][0]]),q=frequency[k[l][1]];m.connect(h.destination);m.type=this.instrument;m.frequency.value=q;m.start(0);m.stop(h.currentTime+p);m.onended=function(){l<k.length-1&&!n.isStopped?(l+=1,n.generate_audio(h,k,l)):h.close()}},play:function(){if(""===this.notes)throw'Property "notes" is invalid';var h=new (window.AudioContext||
window.webkitAudioContext),k=this.parse_notes();this.isStopped=!1;this.generate_audio(h,k,0)},stop:function(){this.isStopped=!0},time:function(){var h=this;if(""===this.notes)return 0;var k=0;this.parse_notes().forEach(function(l){k+=h.get_time(duration[l[0]])});return k}};module.exports=Offbeat;

},{}]},{},[1]);
