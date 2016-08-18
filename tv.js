// vector-06js (c) 2016 Viacheslav Slavinsky
// Main board

"use strict";

var debug = false;
var debug_str = "";

function Vector06c(cpu, memory, io, ay) {
    const SCREEN_WIDTH = 512 + 64;
    const SCREEN_HEIGHT = 256 + 16 + 16; // total - raster area - borders
    const FIRST_VISIBLE_LINE = 312 - SCREEN_HEIGHT;
    const PIXELS_WIDTH = 512;
    const PIXELS_HEIGHT = 256;
    const CENTER_OFFSET = 120;

    var pause_request = false;
    var onpause = undefined;
    var paused = true;

    this.frameSkip = 0;

    this.Memory = memory;
    this.CPU = cpu;
    this.IO = io;

    this.soundnik = new Soundnik(ay, this.IO.Timer);

    var w, h, buf8, data2;
    var usingPackedBuffer = false;
    this.displayFrame = function() {
        if (this.bufferCanvas === undefined || SCREEN_WIDTH != w || SCREEN_HEIGHT != h) {
            this.bufferCanvas = document.createElement("canvas");
            w = this.bufferCanvas.width = SCREEN_WIDTH;
            h = this.bufferCanvas.height = SCREEN_HEIGHT;
            this.bufferContext = this.bufferCanvas.getContext("2d");
            console.log("bufferContext=", this.bufferContext.canvas);

            this.cvsDat = this.bufferContext.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
            //screenCanvas.width = bufferCanvas.width * 1.67;
            this.screenCanvas.width = this.bufferCanvas.width * 1; //1.67;
            this.screenCanvas.height = this.bufferCanvas.height * 1; //(2/1.67);

            usingPackedBuffer = (typeof Uint8ClampedArray !== "undefined") && (this.cvsDat.data.buffer);
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

    this.pixels = new Uint8Array(4);

    this.border_index_cached = 0;
    var self = this;
    this.IO.onborderchange = function(border) {
        self.border_index_cached = border;
    };
    this.mode512 = false;
    this.IO.onmodechange = function(mode) {
        self.mode512 = mode;
    };
    this.tapeout = 0;
    this.IO.ontapeoutchange = function(tape) {
        self.tapeout = tape;
    };

    this.Palette = this.IO.Palette;
    this.between = 0;
    this.instr_time = 0;

    this.oneInterrupt = function(mem, updateScreen) {
        var raster_pixel = 0;
        var raster_line = 0;
        var fb_column = 0;
        var fb_row = 0;

        var index = 0;
        var brk = false;
        var bmpofs = 0;
        var commit_time = -1;
        var commit_time_pal = -1;

        var vborder = true;
        var visible = false;

        this.between = 0;
        for (; !brk;) {
            commit_time = commit_time_pal = -1;

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
                //debug_str = "";
            }

            this.CPU.instruction();
            var dbg_op = this.CPU.last_opcode;
            this.instr_time += this.CPU.vcycles;
            if (dbg_op == 0xd3) {
                commit_time = this.instr_time - 5;
            }
            if (commit_time != -1) {
                commit_time = commit_time * 4 + 4;
                commit_time_pal = commit_time - 20;
            }

            // fill pixels
            //var mode512 = this.IO.Mode512();
            var index_modeless = 0;
            var rpixel, hborder, border;
            var i, end;
            // create locals shorthands to busy arrays
            const bmp = this.bmp;
            const palette = this.Palette;
            const pixels = this.pixels;
            var mode512 = this.mode512;
            for (i = 0, end = this.instr_time << 2; i < end && !brk; i += 2) {
                // this offset is important for matching i/o writes 
                // (border and palette) and raster
                // test:bord2
                rpixel = raster_pixel - 24;
                border = vborder ||
                    /* hborder */
                    (rpixel < (768 - 512) / 2) || (rpixel >= (768 - (768 - 512) / 2));
                if (border) {
                    index = this.border_index_cached;
                    fb_column = 0;
                } else {
                    if ((rpixel & 0x0f) === 0) {
                        this.fetchPixels(fb_column, fb_row, mem);
                        ++fb_column;
                    }

                    index = this.shiftOutPixels();
                }

                // commit regular i/o writes (e.g. border index)
                // test: bord2
                if (i === commit_time) {
                    this.IO.commit();
                    mode512 = this.mode512;
                }
                // commit i/o to palette ram
                // test: bord2
                if (i === commit_time_pal) {
                    this.IO.commit_palette(index);
                }
                //if (updateScreen && (raster_line >= FIRST_VISIBLE_LINE)) {
                if (visible) {
                    var bmp_x = raster_pixel - CENTER_OFFSET; // picture horizontal offset
                    if (bmp_x >= 0 && bmp_x < SCREEN_WIDTH) {
                        if (mode512) {
                            bmp[bmpofs++] = palette[border ? index : (index & 0x03)];
                            bmp[bmpofs++] = palette[border ? index : (index & 0x0c)];
                        } else {
                            bmp[bmpofs++] = palette[index];
                            bmp[bmpofs++] = palette[index];
                        }
                    }
                }

                // 22 vsync
                // 18 border
                // 256 picture
                // 16 border
                raster_pixel += 2;
                if (raster_pixel === 768) {
                    raster_pixel = 0;
                    raster_line += 1;
                    if (!vborder) {
                        --fb_row;
                        if (fb_row < 0) {
                            fb_row = 0xff;
                        }
                    }
                    // update vertical border only when line changes
                    vborder = (raster_line < 40) || (raster_line >= (40 + 256));
                    // turn on pixel copying after blanking area
                    visible |= updateScreen && raster_line === FIRST_VISIBLE_LINE;
                    if (raster_line === 312) {
                        raster_line = 0;
                        visible = false; // blanking starts
                        brk = true;
                    }
                }
                // load scroll register at this precise moment
                // test:scrltst2
                if (raster_line === 22 + 18 && raster_pixel === 150) {
                    fb_row = this.IO.ScrollStart();
                }
                // irq time
                // test:bord2
                else if (raster_line === 0 && raster_pixel === 176 && this.CPU.iff) {
                    this.irq = true;
                }
            }
            var wrap = this.instr_time - (i >> 2);
            var step = this.instr_time - wrap;
            this.soundnik.soundStep(step, this.tapeout);

            this.between += step;
            this.instr_time = wrap;
        }
    };

    this.initCanvas = function() {
        this.screenCanvas = document.getElementById("canvas");

        if (!this.screenCanvas.getContext) {
            alert("Your web browser does not support the 'canvas' tag.\nPlease upgrade/change your browser.");
        }
        this.screenContext = this.screenCanvas.getContext("2d");
        this.bufferCanvas = undefined;
        if (this.displayFrame) this.displayFrame();
        console.log("initCanvas: screnCanvas=", this.screenCanvas);
    };

    var nextFrameTime = new Date().getTime();
    //var bytes = this.Memory.bytes;

    const ACCELERATION_DELAY = 25;
    const THROTTLE_DELAY = 2;

    this.accelerationDelay = 0;
    this.throttleDelay = THROTTLE_DELAY;
    const TARGET_FRAMERATE = 50;
    this.oneFrame = function() {
        var frameRate = TARGET_FRAMERATE / (this.frameSkip + 1);

        this.oneInterrupt(this.Memory.bytes, true);
        for (var i = this.frameSkip; --i >= 0;) {
            this.oneInterrupt(this.Memory.bytes, false);
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
            setTimeout('v06c.oneFrame()', timeWaitUntilNextFrame);
        }
    };


    this.updateDisplay = true;
    this.oneFrameDumbass = function() {
        //var frameRate = this.frameSkip ? ACCELERATION_DELAY : 50;
        var frameRate = 50;

        this.oneInterrupt(this.Memory.bytes, this.updateDisplay);
        if (this.updateDisplay) {
            this.displayFrame();
        }

        var timeWaitUntilNextFrame = nextFrameTime - new Date().getTime();
        if (timeWaitUntilNextFrame < 0) {
            timeWaitUntilNextFrame = 0;
            nextFrameTime = new Date().getTime() + (1000 / frameRate);
            this.updateDisplay = false;
            console.log("feck");
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
            setTimeout('v06c.oneFrame()', timeWaitUntilNextFrame);
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

Vector06c.prototype.fetchPixels = function(column, row, mem) {
    var addr = ((column & 0xff) << 8) | (row & 0xff);
    this.pixels[0] = mem[0x8000 + addr];
    this.pixels[1] = mem[0xa000 + addr];
    this.pixels[2] = mem[0xc000 + addr];
    this.pixels[3] = mem[0xe000 + addr];
};

Vector06c.prototype.shiftOutPixels = function() {
    var pixels = this.pixels;
    var index_modeless = ((pixels[0] & 0x80) >> 4);
    pixels[0] <<= 1;
    index_modeless |= ((pixels[1] & 0x80) >> 5);
    pixels[1] <<= 1;
    index_modeless |= ((pixels[2] & 0x80) >> 6);
    pixels[2] <<= 1;
    index_modeless |= ((pixels[3] & 0x80) >> 7);
    pixels[3] <<= 1;
    return index_modeless;
};