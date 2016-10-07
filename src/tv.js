// vector-06js (c) 2016 Viacheslav Slavinsky
// Main board

// jshint undef: true, unused: true

"use strict";

var debug = false;
var debug_str = "";

const SCREEN_WIDTH = 512 + 64;
const SCREEN_HEIGHT = 256 + 16 + 16;
const FIRST_VISIBLE_LINE = 312 - SCREEN_HEIGHT;
const CENTER_OFFSET = 120;

/** @constructor */
function Vector06c(cpu, memory, io, ay) {
    var pause_request = false;
    var onpause;
    var paused = true;

    this.frameSkip = 0;

    this.Memory = memory;
    this.CPU = cpu;
    this.IO = io;

    this.soundnik = new Soundnik(ay, this.IO.Timer);

    var w, h, buf8;
    var usingPackedBuffer = false;
    this.displayFrame = function() {
        if (this.bufferCanvas === undefined || 
            SCREEN_WIDTH != w || SCREEN_HEIGHT != h) {
            this.bufferCanvas = document.createElement("canvas");
            w = this.bufferCanvas.width = SCREEN_WIDTH;
            h = this.bufferCanvas.height = SCREEN_HEIGHT;
            this.bufferContext = this.bufferCanvas.getContext("2d");
            //console.log("bufferContext=", this.bufferContext.canvas);

            this.cvsDat = this.bufferContext.getImageData(0, 0, 
                SCREEN_WIDTH, SCREEN_HEIGHT);
            this.screenCanvas.width = this.bufferCanvas.width * 1; //1.67;
            this.screenCanvas.height = this.bufferCanvas.height * 1; //(2/1.67);

            usingPackedBuffer = (typeof Uint8ClampedArray !== "undefined") && 
                (this.cvsDat.data.buffer);
            if (usingPackedBuffer) {
                console.debug("Using native packed graphics");
                var bmp2 = this.cvsDat.data.buffer;
                buf8 = new Uint8ClampedArray(bmp2);
                this.bmp = new Uint32Array(bmp2);
            } else {
                console.debug("Using manually unpacked graphics");
                buf8 = this.cvsDat.data;
                for (var loop = 0; loop < buf8.length; loop++) buf8[loop] = 0xFF;

                this.bmp = typeof(Int32Array) != "undefined" ?
                    new Int32Array(SCREEN_WIDTH * SCREEN_HEIGHT) :
                    new Array(SCREEN_WIDTH * SCREEN_HEIGHT);
            }
        }

        if (!usingPackedBuffer) {
            // have to manually unpack ints to bytes
            var fc;
            for (var i = 0, ix = 0; i < this.bmp.length; i += 1) {
                fc = this.bmp[i];
                buf8[ix + 0] = fc & 0xFF;
                buf8[ix + 1] = (fc >> 8) & 0xFF;
                buf8[ix + 2] = (fc >> 16) & 0xFF;
                ix += 4;
            }
        }
        this.bufferContext.putImageData(this.cvsDat, 0, 0);
        this.screenContext.drawImage(this.bufferCanvas, 0, 0,
            this.screenCanvas.width, this.screenCanvas.height);
    };

    // one cycle 
    // CPU clock = 3 MHz
    // pixelclock = 12 Mhz (512 pixels/line)
    // 1 CPU cycle (cpu clock) = 4 pixelclocks
    // e.g. MOV A, B 
    //          == 5 cpu clocks
    //          == 8 cpu clocks in Vector-06c machine
    //          == 8 * 4 = 32 pixelcocks, 32 pixels in mode 512 or 16 pixels in mode 256
    // one raster line = 12e6/15625 
    //          == 768 pixels (12Mhz)
    //          == 192 CPU cycles
    // one TV field = 312 lines
    // one interrupt cycle == 312 * 768 = 239616 pixels
    //                     == 59904 CPU cycles
    //                     == 29952 timer cycles
    // 1/50s = 29952 samples, or 1497600 samples/s
    //
    // ay clock: 1.75Mhz, 7/48 of pixelclock
    //
    this.irq = false;

    var self = this;
    this.tapeout = 0;
    this.IO.ontapeoutchange = function(tape) {
        self.tapeout = tape;
    };

    this.Palette = this.IO.Palette;
    this.between = 0;
    this.instr_time = 0;

    this.initCanvas = function() {
        this.screenCanvas = document.getElementById("canvas");

        if (!this.screenCanvas.getContext) {
            alert("Your web browser does not support the 'canvas' tag.\nPlease upgrade/change your browser.");
        }
        this.screenContext = this.screenCanvas.getContext("2d");
        this.bufferCanvas = undefined;
        if (this.displayFrame) this.displayFrame();
    };

    var nextFrameTime = new Date().getTime();

    const ACCELERATION_DELAY = 25;
    const THROTTLE_DELAY = 2;

    this.accelerationDelay = 0;
    this.throttleDelay = THROTTLE_DELAY;
    const TARGET_FRAMERATE = 50;
    this.oneFrame = function() {
        var frameRate = TARGET_FRAMERATE / (this.frameSkip + 1);

        this.oneInterrupt(true);
        for (var i = this.frameSkip; --i >= 0;) {
            this.oneInterrupt(false);
        }

        this.displayFrame();
        var timeWaitUntilNextFrame = nextFrameTime - new Date().getTime();
        if (timeWaitUntilNextFrame < 0) {
            if (this.frameSkip < 8) {
                if (--this.throttleDelay < 0) {
                    this.throttleDelay = THROTTLE_DELAY;
                    ++this.frameSkip;
                    frameRate = TARGET_FRAMERATE / (this.frameSkip + 1);
                    if (this.onframeskip) {
                        this.onframeskip(this.frameSkip, -timeWaitUntilNextFrame);
                    }
                }
            }
            timeWaitUntilNextFrame = 0;
            this.accelerationDelay = ACCELERATION_DELAY;
            nextFrameTime = new Date().getTime() + (1000 / frameRate);
        } else {
            this.throttleDelay = THROTTLE_DELAY;
            if (this.frameSkip > 0 && timeWaitUntilNextFrame > 1000 / TARGET_FRAMERATE) {
                if (this.accelerationDelay === 0 || --this.accelerationDelay === 0) {
                    --this.frameSkip;
                    this.accelerationDelay = ACCELERATION_DELAY;
                    if (this.onframeskip) {
                        this.onframeskip(this.frameSkip, -timeWaitUntilNextFrame);
                    }
                }
            } else {
                this.accelerationDelay = ACCELERATION_DELAY;
            }
            nextFrameTime += (1000 / frameRate);
        }

        if (pause_request) {
            pause_request = false;
            paused = true;
            if (onpause) {
                onpause();
                onpause = undefined;
            }
        } else {
            (function(v) {
                setTimeout(function() {v.oneFrame();}, timeWaitUntilNextFrame);
             })(this);
        }
    };

    this.updateDisplay = true;
    this.oneFrameDumbass = function() {
        var frameRate = 50;

        this.oneInterrupt(this.updateDisplay);
        if (this.updateDisplay) {
            this.displayFrame();
        }

        var timeWaitUntilNextFrame = nextFrameTime - new Date().getTime();
        if (timeWaitUntilNextFrame < 0) {
            timeWaitUntilNextFrame = 0;
            nextFrameTime = new Date().getTime() + (1000 / frameRate);
            this.updateDisplay = false;
        } else {
            nextFrameTime += (1000 / frameRate);
            this.updateDisplay = true;
        }

        if (pause_request) {
            pause_request = false;
            paused = true;
            if (onpause) {
                onpause();
                onpause = undefined;
            }
        } else {
            (function(v) {
                setTimeout(function() {v.oneFrame();}, timeWaitUntilNextFrame);
             })(this);
        }
    };

    this.oneFrameTest = function() {
        for(var frameno = 0; !paused; frameno++) {
            this.oneInterrupt(true);
            this.displayFrame();
            
            /*
            var sss = "";
            for (var i = 0; i < 64; i++) {
                sss += this.bmp[i].toString(16) + " ";
            }
            console.log("oneFrame bmp: " + sss);
            */
            if (this.ondisplay) {
                this.ondisplay();
            }

            if (pause_request) {
                pause_request = false;
                paused = true;
                if (onpause) {
                    onpause();
                    onpause = undefined;
                }
            } 
        }
    };

    this.initCanvas();

    // start the dance
    this.BlkSbr = function(keep_rom) {
        pause_request = false;
        paused = false;
        this.CPU.pc = 0;
        this.CPU.sp = 0;
        this.CPU.iff = false;
        if (!keep_rom) {
            this.Memory.detach_boot();
        }
        this.IO.Timer.Write(3, 0x36);
        this.IO.Timer.Write(3, 0x76);
        this.IO.Timer.Write(3, 0xb6);
        ay.reset();
        this.oneFrame();
    };

    this.resume = function() {
        pause_request = false;
        paused = false;
        this.oneFrame();
    };

    this.pause = function(callback) {
        if (!paused) {
            onpause = callback;
            pause_request = true;
        } else {
            callback();
        }
    };
}

// Must be called before this.CPU.instruction()
Vector06c.prototype.checkInterrupt = function() {
    if (this.irq && this.CPU.iff) {
        this.irq = false;
        //this.between = 0;
        // i8080js does not have halt mode, but loops on halt instruction
        // if in halt, advance pc + 1 and sideload rst7 instruction
        // this is a fairly close equivalent to what real 8080 is doing
        if (this.CPU.last_opcode == 0x76) { // 0x76 == hlt
            this.CPU.pc += 1;
        }
        this.CPU.execute(0xf3); // di
        this.CPU.execute(0xff); // 0xff == rst7
        this.instr_time += 16; // execution time known
    }
};

Vector06c.prototype.oneInterrupt = function(updateScreen) {
    if (!this.filler) {
        this.filler = new PixelFiller(this.bmp,this.Palette,this.IO,this.Memory.bytes);
    }
    this.filler.reset();

    var commit_time = -1;       // i/o commit time adjust
    var commit_time_pal = -1;   // palette commit time adjust
    this.between = 0;           // cpu cycles counter per interrupt
    for (; !this.filler.brk;) {
        commit_time = commit_time_pal = -1;
        this.checkInterrupt();
        this.filler.irq = this.filler.irq && this.irq;
        this.CPU.instruction();
        var dbg_op = this.CPU.last_opcode;
        this.instr_time += this.CPU.vcycles;
        if (dbg_op == 0xd3) {   // out
            commit_time = this.instr_time - 5;
        }
        if (commit_time != -1) {
            commit_time = commit_time * 4 + 4;
            commit_time_pal = commit_time - 20;
        }

        let clk = this.filler.fill(this.instr_time << 2, 
            commit_time, commit_time_pal, updateScreen);
        this.irq = this.CPU.iff && this.filler.irq;
        let wrap = this.instr_time - (clk >> 2);
        let step = this.instr_time - wrap;
        this.soundnik.soundStep(step, this.tapeout);

        this.between += step;
        this.instr_time = wrap;
    }
};

/** @constructor */
function PixelFiller(bmp, palette, io, bytes) {
    this.bmp = bmp;
    this.palette = palette;
    this.IO = io;
    this.bytes = bytes;
    this.mem32 = new Uint32Array(bytes.buffer);
    this.pixel32 = 0;  // 4 bytes of bit planes
    this.border_index = 0;

    this.reset();
    var self = this;
    this.IO.onborderchange = function(border) {
        self.border_index = border;
    };
    this.mode512 = false;
    this.IO.onmodechange = function(mode) {
        self.mode512 = mode;
    };
}

PixelFiller.prototype.reset = function() {
    this.raster_pixel = 0;   // horizontal pixel counter
    this.raster_line = 0;    // raster line counter
    this.fb_column = 0;      // frame buffer column
    this.fb_row = 0;         // frame buffer row
    this.vborder = true;     // vertical border flag
    this.visible = false;    // visible area flag
    this.bmpofs = 0;         // bitmap offset for current pixel
    this.brk = false;
    this.irq = false;
};

PixelFiller.prototype.fetchPixels = function() {
    const addr = ((this.fb_column & 0xff) << 8) | (this.fb_row & 0xff);
    this.pixel32 = this.mem32[0x2000 + addr];
};

PixelFiller.prototype.shiftOutPixels = function() {
    const p = this.pixel32;
    // msb of every byte in p stands for bit plane
    var modeless = (p >> 4 & 8) | (p >> 13 & 4) | (p >> 22 & 2) | (p >> 31 & 1);
    // shift left
    this.pixel32 = (p << 1);// & 0xfefefefe; -- unnecessary
    return modeless;
};

PixelFiller.prototype.fill = function(clocks,commit_time,commit_time_pal,updateScreen) {
    const bmp = this.bmp;
    const palette = this.palette;
    var clk;
    for (clk = 0; clk < clocks && !this.brk; clk += 2) {
        // offset for matching border/palette writes and the raster -- test:bord2
        const rpixel = this.raster_pixel - 24;
        const border = this.vborder || 
            /* hborder */ (rpixel < (768-512)/2) || (rpixel >= (768 - (768-512)/2));
        const index = this.getColorIndex(rpixel, border);

        if (clk === commit_time) {
            this.IO.commit(); // regular i/o writes (border index); test: bord2
        }
        if (clk === commit_time_pal) {
            this.IO.commit_palette(index); // palette writes; test: bord2
        }
        if (this.visible) {
            const bmp_x = this.raster_pixel - CENTER_OFFSET; // horizontal offset
            if (bmp_x >= 0 && bmp_x < SCREEN_WIDTH) {
                if (this.mode512 && !border) {
                    bmp[this.bmpofs++] = palette[index & 0x03];
                    bmp[this.bmpofs++] = palette[index & 0x0c];
                } else {
                    let p = palette[index];
                    bmp[this.bmpofs++] = p;
                    bmp[this.bmpofs++] = p;
                }
            }
        }
        // 22 vsync + 18 border + 256 picture + 16 border = 312 lines
        this.raster_pixel += 2;
        if (this.raster_pixel === 768) {
            this.advanceLine(updateScreen);
        }
        // load scroll register at this precise moment -- test:scrltst2
        if (this.raster_line === 22 + 18 && this.raster_pixel === 150) {
            this.fb_row = this.IO.ScrollStart();
        }
        // irq time -- test:bord2
        else if (this.raster_line === 0 && this.raster_pixel === 176) {
            this.irq = true;
        }
    } 
    return clk;
};

PixelFiller.prototype.advanceLine = function(updateScreen) {
    this.raster_pixel = 0;
    this.raster_line += 1;
    this.fb_row -= 1;
    if (!this.vborder && this.fb_row < 0) {
        this.fb_row = 0xff;
    }
    // update vertical border only when line changes
    this.vborder = (this.raster_line < 40) || (this.raster_line >= (40 + 256));
    // turn on pixel copying after blanking area
    this.visible = this.visible || 
        (updateScreen && this.raster_line === FIRST_VISIBLE_LINE);
    if (this.raster_line === 312) {
        this.raster_line = 0;
        this.visible = false; // blanking starts
        this.brk = true;
    }
};

PixelFiller.prototype.getColorIndex = function(rpixel, border) {
    if (border) {
        this.fb_column = 0;
        return this.border_index;
    } else {
        if ((rpixel & 0x0f) === 0) {
            this.fetchPixels();
            ++this.fb_column;
        }
        return this.shiftOutPixels();
    }
};

