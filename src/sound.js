// vector-06js (c) 2016 Viacheslav Slavinsky
// Sound Engine
//
// Big thanks to vic-20chrome project by Matt Dawson 
// www.mdawson.net/vic20chrome/vic20.php
// A large portion of this code has been pulled from that project


// exported Soundnik

"use strict";

/** @constructor */
function Biquad(b, a) {
    this.a0 = b[0];
    this.a1 = b[1];
    this.a2 = b[2];
    if (a.length === 2) {
        this.b1 = a[0];
        this.b2 = a[1];
    } else {
        this.b1 = a[1];
        this.b2 = a[2];
    }
    this.x_1 = 0;
    this.x_2 = 0;
    this.y_1 = 0;
    this.y_2 = 0;
}

Biquad.prototype.filter = function(x) {
    var result = this.a0*x + this.a1*this.x_1 + this.a2*this.x_2 - 
                 this.b1*this.y_1 - this.b2*this.y_2;
    this.x_2 = this.x_1;
    this.x_1 = x;
    this.y_2 = this.y_1;
    this.y_1 = result;
    return result;
}

function Allpass() {
    this.filter = function(x) {
        return x;
    }
}

function IIRn(b, a) {
    this.b = b;
    this.a = a;
    this.zx = new Float32Array(b.length);
    this.zy = new Float32Array(a.length - 1);
    this.zxptr = 0;
    this.zyptr = 0;

    for (var i = 0; i < this.zx.length; i++) this.zx[i] = 0;
    for (var i = 0; i < this.zy.length; i++) this.zy[i] = 0;
}

IIRn.prototype.filter = function(x) {
    var y_ff = 0;
    var y_fb = 0;

    this.zx[this.zxptr] = x;
    var xp = this.zxptr;
    for (let i = 0; i < this.b.length; ++i) {
        y_ff += this.b[i] * this.zx[xp];
        if (i + 1 < this.b.length) {
            xp -= 1;
            if (xp < 0) {
                xp = this.zx.length - 1;
            }
        }
    }
    this.zxptr = xp;
    
    var yp = this.zyptr;
    for (let i = 1; i < this.a.length; ++i) {
       y_fb += -this.a[i] * this.zy[yp];
       if (i + 1 < this.a.length) {
            yp -= 1;
            if (yp < 0) {
                yp = this.zy.length - 1;
            }
        }
    }
    this.zyptr = yp;

    var y = (y_ff + y_fb) / this.a[0];
    this.zy[yp] = y;

    return y;
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

    this.filtr_kotov(7);

    // for 1.5e6 samplerate 
    this.debugbuf = new Float32Array(1500000*2);
    //this.debugbuf = new Float32Array(44100*10);
    this.debugidx = 0;
    this.download_enable = true;
    this.debug_before = 1000; 

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
        this.soundRatio = this.sampleRate / 1497600;//1500000;//1497600.0;

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

Soundnik.prototype.filtr_kotov = function(fc) {
    var iirCalculator = new CalcCascades();
    var coefs = iirCalculator.lowpass({
        order: 2, // cascade 2 biquad filters (max: 12) 
        characteristic: 'butterworth',
        Fs: 1.5e6, // sampling frequency 
        Fc: fc * 1e3, // cutoff frequency
        gain: 0, // gain for peak, lowshelf and highshelf 
        preGain: false // adds one constant multiplication for highpass and lowpass 
                        // k = (1 + cos(omega)) * 0.5 / k = 1 with preGain == false 
      });
    this.butt1 = new Biquad(coefs[0].b, coefs[0].a);
    this.butt2 = new Biquad(coefs[1].b, coefs[1].a);
};

Soundnik.prototype.filter_cheby2 = function(fc) {
    // [b,a]=cheby2(2,40,55000/1.5e6); freqz(b,a,1.5e6); printf("const b=[");for x = 1:length(b); printf("%1.14e", b(x)); if x!=length(b) printf(",");endif; endfor; printf("];\n");  printf("const a=[");for x = 1:length(b); printf("%1.14e", a(x)); if x!=length(b) printf(",");endif; endfor; printf("];\n");
    const b=[9.95164457063040e-03,-1.96403528864328e-02,9.95164457063041e-03];
    const a=[1.00000000000000e+00,-1.97705063325727e+00,9.77313569512096e-01];

    this.butt1 = new Biquad(b, a);//IIRn(b, a);
    this.butt2 = new Allpass();
};

Soundnik.prototype.filter_biquads = function(fc) {
    this.butt1 = new Biquad([ 0.0016277331770698821, 0.0032554663541397642, 0.0016277331770698821], [ 1, -1.8499679403906526, 0.8564788730989321]);
    this.butt2 = new Biquad([0.0016991596744121095, 0.003398319348824219, 0.0016991596744121095],[ 1, -1.9311463128898734, 0.9379429515875216]);
};

Soundnik.prototype.sample = function(samp) {
    var plus1 = (this.sndCount + 1) & this.mask;
    if (plus1 != this.sndReadCount) {
        this.renderingBuffer[this.sndCount] = samp;
        this.sndCount = plus1;
    }
};

Soundnik.prototype.soundStep = function(step, tapeout, covox) {
    var sound = this.timerwrapper.step(step / 2);
    sound += tapeout - 0.5;

    // ay step should execute, but the sound can be sampled only 
    // when needed, no filtering necessary
    this.aywrapper.step2(step);

    // it's okay if sound is not used this time, the state is kept in the filters
    sound = this.butt2.filter(this.butt1.filter(sound));

    this.soundAccu += this.soundRatio;
    if (this.soundAccu >= 1.0) {
        this.soundAccu -= 1.0;
        sound += covox / 256;
        sound += this.aywrapper.last - 0.5;
        sound = (sound - 1.5) * 0.3;
        if (sound > 1.0) { 
            sound = 1.0; 
        } else if (sound < -1.0) { 
            sound = -1.0; 
        }
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
        this.debugbuf[this.debugidx] = debugsound;
        this.debugidx++;
        if (this.debugidx == this.debugbuf.length) {
            if (this.download_enable) {
                __download(this.debugbuf, "sound.raw", "application/octet-stream");
                this.download_enable = false;
            }
            this.debugidx = 0;
        }
    }
*/

};

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


