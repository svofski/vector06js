// vector-06js (c) 2016 Viacheslav Slavinsky
// Sound Engine
//
// Big thanks to vic-20chrome project by Matt Dawson 
// www.mdawson.net/vic20chrome/vic20.php
// A large portion of this code has been pulled from that project

"use strict";

function Soundnik(ay, timer) {    
    this.aywrapper = new AYWrapper(ay);
    this.timerwrapper = new TimerWrapper(timer);

    /**
     * Buffer for sound event messages.
     */
    this.renderingBufferSize = 8192;
    this.mask = this.renderingBufferSize - 1;
    this.renderingBuffer = null;
    this.sampleRate = null;
	this.gainNode = null;

    this.soundRatio = 0; //this.soundnik.sampleRate / 1497600.0;
    this.soundAccu = 0.0;

    /**
     * Offset into sndData for next sound sample.
     */
    this.sndCount = 0;
    this.sndReadCount = 0;
    this.cs = 0;

    if (typeof AudioContext != "undefined") {
        console.debug("AudioContext found");

		var context = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new context(); //new AudioContext();
        this.sampleRate = this.audioContext.sampleRate;
        this.soundRatio = this.sampleRate / 1497600.0;

        this.jsNode = this.audioContext.createScriptProcessor(2048, 0, 2);
		this.gainNode = this.audioContext.createGain();
		this.gainNode.gain.value = 1;

        //this.jsNode.connect(this.audioContext.destination);
        var that = this;
        this.jsNode.onaudioprocess = function(event) {
            var diff = (that.sndCount - that.sndReadCount) & that.mask;
            if (diff >= 2048) {
                var o = event.outputBuffer;
                var l = o.getChannelData(0);
                var r = o.getChannelData(1);

                var src = that.sndReadCount;
                var rbuffer = that.renderingBuffer;
                for (var i = 0; i < 2048;) {
                    l[i] = r[i] = rbuffer[src];
                    i += 1;
                    src += 1;
                    l[i] = r[i] = rbuffer[src];
                    i += 1;
                    src += 1;
                    l[i] = r[i] = rbuffer[src];
                    i += 1;
                    src += 1;
                    l[i] = r[i] = rbuffer[src];
                    i += 1;
                    src += 1;
                }
                that.sndReadCount = src & that.mask;
            } else {
                //console.debug("audio starved");
            }
        }
        this.jsNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.hasAudio = true;
    }

    if (this.hasAudio) {
        this.renderingBuffer = new Float32Array(this.renderingBufferSize);
    }

 
	this.mute = function(m) {
		if (this.gainNode) {
			this.gainNode.gain.value = m ? 0 : 1;
		}
	}
}

Soundnik.prototype.sample = function(samp) {
    var plus1 = (this.sndCount + 1) & this.mask;
    if (plus1 != this.sndReadCount) {
        this.renderingBuffer[this.sndCount] = samp;
        this.sndCount = plus1;
    }
}

Soundnik.prototype.soundStep = function(step, tapeout) {
    this.soundAccu += this.soundRatio * step / 2;
    if (this.soundAccu >= 1.0) {
        this.soundAccu -= 1.0;
        var sound = 
            1.0 * this.timerwrapper.unload() + 
            this.aywrapper.unload() + 
            tapeout +
            Math.random() * 0.005;

        this.sample(sound - 0.5);
    }

    this.timerwrapper.step(step / 2);
    this.aywrapper.step(step);

}    

