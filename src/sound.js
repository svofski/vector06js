// vector-06js (c) 2016 Viacheslav Slavinsky
// Sound Engine
//
// Big thanks to vic-20chrome project by Matt Dawson 
// www.mdawson.net/vic20chrome/vic20.php
// A large portion of this code has been pulled from that project


// exported Soundnik

"use strict";

/** @constructor */
function Filter(a0, a1, a2, b1, b2) {
    this.a0 = a0;
    this.a1 = a1;
    this.a2 = a2;
    this.b1 = b1;
    this.b2 = b2;
    this.x_1 = 0;
    this.x_2 = 0;
    this.y_1 = 0;
    this.y_2 = 0;
}

Filter.prototype.filter = function(x) {
    var result = this.a0*x + this.a1*this.x_1 + this.a2*this.x_2 - 
                 this.b1*this.y_1 - this.b2*this.y_2;
    this.x_2 = this.x_1;
    this.x_1 = x;
    this.y_2 = this.y_1;
    this.y_1 = result;
    return result;
}

function FIR(coef) {
    this.coef = coef;
    this.x = new Float32Array(coef.length);
    this.ptr = 0;
}
FIR.prototype.filter = function(v) {
    const x = this.x;
    const c = this.coef;
    const len = x.length;
    var ptr = this.ptr;
    x[ptr] = v;
    var y = 0;
    for (var k = ptr + 1, i = 0; k != ptr; k = (k + 1) % len, ++i) {
        y += c[i] * x[k];
    }
    this.ptr = (ptr + 1) % len;
    return y;
}

/** @constructor */
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

    this.soundRatio = 0;
    this.soundAccu = 0.0;

    // Cascade biquad of 4th order: Q1=0.54 Q2=1.31
    // http://www.earlevel.com/main/2016/09/29/cascading-filters/
    // http://www.earlevel.com/main/2013/10/13/biquad-calculator-v2/
    // Sample rate 1.5e6, Fc=9500
    this.filter = new Filter(
        0.0003817657919193142,
        0.0007635315838386284,
        0.0003817657919193142,
        -1.9274180891347181,
        0.9289451523023953
    );
    this.filter2 = new Filter(
        0.0003898632033061222,
        0.0007797264066122444,
        0.0003898632033061222,
        -1.9682994292454574,
        0.9698588820586818
    );

    //this.debugbuf = new Float32Array(1500000*2);
    //this.debugidx = 0;
    //this.download_enable = true;
    //this.debug_before = 100000; 

    /**
     * Offset into sndData for next sound sample.
     */
    this.sndCount = 0;
    this.sndReadCount = 0;
    this.cs = 0;

    if (typeof AudioContext != "undefined") {
        console.debug("AudioContext found");

        var context = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new context();
        this.sampleRate = this.audioContext.sampleRate;
        this.soundRatio = this.sampleRate / 1500000;//1497600.0;

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
        };
        this.jsNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.hasAudio = true;
    }

    if (this.hasAudio) {
        this.renderingBuffer = new Float32Array(this.renderingBufferSize);
    }

    // @this {Soundnik}
    this.mute = 
        (function(sndnik) {
            return (function(m) {
                if (sndnik.gainNode) {
                    sndnik.gainNode.gain.value = m ? 0 : 1;
                }
            });
        })(this);
}

Soundnik.prototype.sample = function(samp) {
    var plus1 = (this.sndCount + 1) & this.mask;
    if (plus1 != this.sndReadCount) {
        this.renderingBuffer[this.sndCount] = samp;
        this.sndCount = plus1;
    }
};

Soundnik.prototype.soundStep = function(step, tapeout) {
    var sound = this.timerwrapper.step(step / 2);
    sound += this.aywrapper.step2(step);
    sound += 0.3 * (tapeout - 0.5);
    // it's okay if sound is not used this time, the state is kept in the filters
    for (var q = step/2; --q >= 0;) {
        sound = this.filter2.filter(this.filter.filter(sound));
    }
    this.soundAccu += this.soundRatio * step / 2;
    if (this.soundAccu >= 1.0) {
        this.soundAccu -= 1.0;

        sound += Math.random() * 0.002;
        this.sample(sound);
    }

    /*
    if (this.debug_before) {
        if (this.timerwrapper.timer.counters[0].latch_mode == 1) {
            --this.debug_before;
        }
        return;
    }
    for (var s = step / 2; --s >= 0;) {
        this.debugbuf[this.debugidx] = this.timerwrapper.last_sound * 0.3;
        this.debugidx++;
        if (this.debugidx == this.debugbuf.length) {
            if (this.download_enable) {
                download(this.debugbuf, "sound.raw", "application/octet-stream");
                this.download_enable = false;
            }
            this.debugidx = 0;
        }
    }
    */
};

/*
// Function to download data to a file
function __download(data, filename, type) {
    var a = document.createElement("a"),
        file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0); 
    }
}
*/


