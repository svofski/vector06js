// vector-06js (c) 2016 Viacheslav Slavinsky
// Main board

"use strict";

var debug = false;
var debug_str = "";

function Memory() {
    this.bytes = new Uint8Array(65536 + 256 * 1024);
    for (var i = 0x0000; i < this.bytes.length; i++) {
        this.bytes[i] = 0; 
    }

    this.mode_stack = false;
    this.mode_map = false;
    this.page_map = 0;
    this.page_stack = 0;

    var dbg_ctr = 0;
    this.control_write = function(w8) {
        //console.log("kvaz control_write: ", w8.toString(16));
        this.mode_stack = (w8 & 0x10) != 0;
        this.mode_map = (w8 & 0x20) != 0;
        this.page_map = ((w8) & 3) + 1;
        this.page_stack = (((w8) & 0xc) >> 2) + 1;
        // if (mode_map) {
        //     console.log("kvz page select ", page_map);
        // } else {
        //     console.log("kvz nax");
        // }
    }

    // 8000 -> 8000
    // a000 -> 8001   1010 0000 0000 0000 -> 1000 0000 0000 0001
    // c000 -> 8002
    // e000 -> 8003
    // 8001 -> 8004
    this.bigram_select = function(addr, stackrq) {
        if (!(this.mode_map || this.mode_stack)) {
            return addr;
        } else if (this.mode_stack && stackrq != undefined && stackrq) {
            return addr + (this.page_stack << 16);
        } else if (this.mode_map && addr >= 0xa000 && addr < 0xe000) {
            return addr + (this.page_map << 16);
        }
        return addr;
    }

    this.read = function(addr, stackrq) {
        return this.bytes[this.bigram_select(addr & 0xffff, stackrq)];
    }

    this.write = function(addr, w8, stackrq) {
        this.bytes[this.bigram_select(addr & 0xffff, stackrq)] = w8;
    }

    this.load_file = function(files, name) {
        if (files[name] == null) {
            console.log("File " + name + " is not found");
            return;
        }
        var end = files[name].start + files[name].image.length - 1;
        for (var i = files[name].start; i <= end; ++i)
            this.write(i, files[name].image.charCodeAt(i - files[name].start));

        console.log("*********************************");
        var size = files[name].end - files[name].start + 1;
        console.log("File \"" + name + "\" loaded, size " + size);
    }

    this.init_from_array = function(array, start_addr) {
        for (var i = this.bytes.length; --i >= 0;) {
            this.bytes[i] = 0;
        }
        for (var i = 0, end = array.length; i < end; i++) {
            this.write(start_addr + i, array[i], false);
        }
    }

    this.dump = function() {
        var s = "";
        var addr = 0;
        for (var i = 0; i < 8192;) {
            s += this.bytes[i].toString(16) + " ";
            ++i;
            if (i % 16 == 0) {
                console.log(addr.toString(16) + "  " + s);
                s = "";
                addr += 16;
            }
        }
    }
}

function IO(keyboard, timer, kvaz, ay) {
    this.iff = false;
    this.Palette = new Uint32Array(16);
    this.Timer = timer;
    this.onmodechange = function(mode) {};
    this.onborderchange = function(border) {};
    this.ontapeoutchange = function(tape) {};

    var CW = 0,
        PA = 0xff,
        PB = 0xff,
        PC = 0xff;
    var CW2 = 0,
        PA2 = 0xff,
        PB2 = 0xff,
        PC2 = 0xff;
    var outport, outbyte, palettebyte;

    this.input = function(port) {
        var result = 0xff;
        switch (port) {
            case 0x00:
                //result = 0x80 | CW;
                // No read operation of the control word register is allowed
                result = 0xff;
                break;
            case 0x01:
                result = (PC & 0x0f)  | 0x10 | 
                    (keyboard.ss ? 0 : (1 << 5)) |
                    (keyboard.us ? 0 : (1 << 6)) |
                    (keyboard.rus ? 0 : (1 << 7));
                break;
            case 0x02:
                if ((CW & 0x02) != 0) {
                    result = keyboard.Read(~PA);
                } else {
                    result = 0xff;
                }
                break;
            case 0x03:
                if ((CW & 0x10) == 0) {
                    result = 0x00;
                } else {
                    result = 0xff;
                }
                break;

            case 0x04:
                result = CW2;
                break;
            case 0x05:
                result = PC2;
                break;
            case 0x06:
                result = PB2;
                break;
            case 0x07:
                result = PA2;
                break;

                // Timer
            case 0x08:
            case 0x09:
            case 0x0a:
            case 0x0b:
                return this.Timer.Read(~(port & 3));
                break;

            case 0x14:
            case 0x15:
                result = ay.read(port & 1);
                break;
        }
        return result;
    }

    this.output = function(port, w8) {
        outport = port;
        outbyte = w8;
    }


    this.realoutput = function(port, w8) {
        switch (port) {
            // PIA 
            case 0x00:
                CW = w8;
                if ((CW & 0x80) == 0) {
                    // port C BSR: 
                    //   bit 0: 1 = set, 0 = reset
                    //   bit 1-3: bit number
                    var bit = (CW >> 1) & 7;
                    if ((CW & 1) == 1) {
                        PC |= 1 << bit;
                    } else {
                        PC &= ~(1<<bit);
                    }
                    this.ontapeoutchange(PC & 1);
                }
                // if (debug) {
                //     console.log("output commit cw = ", CW.toString(16));
                // }
                break;
            case 0x01:
                PC = w8;
                this.ontapeoutchange(PC & 1);
                break;
            case 0x02:
                PB = w8;
                this.onborderchange(PB & 0x0f);
                this.onmodechange((PB & 0x10) != 0);
                break;
            case 0x03:
                PA = w8;
                break;
                // PPI2
            case 0x04:
                CW2 = w8;
                break;
            case 0x05:
                PC2 = w8;
                break;
            case 0x06:
                PB2 = w8;
                break;
            case 0x07:
                PA2 = w8;
                break;
                // Timer
            case 0x08:
            case 0x09:
            case 0x0a:
            case 0x0b:
                this.Timer.Write((~port & 3), w8);
                break;

            case 0x0c:
            case 0x0d:
            case 0x0e:
            case 0x0f:
                this.palettebyte = w8;
                break;
            case 0x10:
                // kvas 
                kvaz.control_write(w8);
                break;
            case 0x14:
            case 0x15:
                ay.write(port & 1, w8);
                break;
        }
    }

    this.commit = function() {
        if (outport != undefined) {
            this.realoutput(outport, outbyte);
            outport = outbyte = undefined;
        }
    }

    this.commit_palette = function(index) {
        var w8 = this.palettebyte;
        if (w8 == undefined && outport == 0x0c) {
            w8 = outbyte;
            outport = outbyte = undefined;
        }
        if (w8 != undefined) {
            var b = (w8 & 0xc0) >> 6;
            var g = (w8 & 0x38) >> 3;
            var r = (w8 & 0x07);
            this.Palette[index] =
                0xff000000 |
                (b << (6 + 16)) |
                (g << (5 + 8)) |
                (r << (5 + 0));
            this.palettebyte = undefined;
        }
    }

    this.interrupt = function(iff) {
        this.iff = iff;
    }

    this.BorderIndex = function() {
        return PB & 0x0f;
    }

    this.ScrollStart = function() {
        return PA;
    }

    this.Mode512 = function() {
        return (PB & 0x10) != 0;
    }

	this.TapeOut = function() {
		return PC & 1;
	}
}

function Vector06c(cpu, memory, io, ay) {
    this.SCREEN_WIDTH = 600;
    this.SCREEN_HEIGHT = 312;
    this.PIXELS_WIDTH = 512;
    this.PIXELS_HEIGHT = 256;
    this.BORDER_LEFT = this.BORDER_RIGHT = (this.SCREEN_WIDTH - this.PIXELS_WIDTH) / 2;
    this.BORDER_TOP = this.BORDER_BOTTOM = (this.SCREEN_HEIGHT - this.PIXELS_HEIGHT) / 2;

    var pause_request = false;
    var onpause = undefined;
    var paused = true;

    this.bmp = undefined;

    this.Memory = memory;
    this.CPU = cpu;
    this.IO = io;
    this.Timer = this.IO.Timer;

    this.soundnik = new Soundnik(this);
    this.renderingBuffer = this.soundnik.renderingBuffer;
    this.soundRatio = this.soundnik.sampleRate / 1497600.0;
    this.soundAccu = 0.0;

    var w, h, buf8, data2;
    var usingPackedBuffer = false;
    this.displayFrame = function() {
        if (this.bufferCanvas === undefined || this.SCREEN_WIDTH != w || this.SCREEN_HEIGHT != h) {
            this.bufferCanvas = document.createElement("canvas");
            w = this.bufferCanvas.width = this.SCREEN_WIDTH;
            h = this.bufferCanvas.height = this.SCREEN_HEIGHT;
            this.bufferContext = this.bufferCanvas.getContext("2d");
            console.log("bufferContext=", this.bufferContext.canvas);

            this.cvsDat = this.bufferContext.getImageData(0, 0, this.SCREEN_WIDTH, this.SCREEN_HEIGHT);
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
                    new Int32Array(this.SCREEN_WIDTH * this.SCREEN_HEIGHT) : 
                    new Array(this.SCREEN_WIDTH * this.SCREEN_HEIGHT);
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
    }

    // 1/2/3/4 1/2/3/4
    // 0 = 0000
    // 1 = 2000
    // 2 = 4000
    // 3 = 6000
    // addr = {addr[1:0],addr[14:0]}
    this.fetchPixels = function(column, row, mem) {
        var addr = ((column & 0xff) << 8) | (row & 0xff);
        this.pixels[3] = mem[0xe000 + addr];
        this.pixels[2] = mem[0xc000 + addr];
        this.pixels[1] = mem[0xa000 + addr];
        this.pixels[0] = mem[0x8000 + addr];
    }

    // one cycle 
    // CPU clock = 3 MHz
    // pixelclock = 12 Mhz (512 pixels/line)
    // 1 CPU cycle (cpu clock) = 4 pixelclocks
    // e.g. MOV A, B 
    //			== 5 cpu clocks
    // 			== 8 cpu clocks in Vector-06c machine
    //			== 8 * 4 = 32 pixelcocks, 32 pixels in mode 512 or 16 pixels in mode 256
    // one raster line = 12e6/15625 
    // 			== 768 pixels (12Mhz)
    // 			== 192 CPU cycles
    // one TV field = 312 lines
    // one interrupt cycle == 312 * 768 = 239616 pixels
    // 					   == 59904 CPU cycles
    // 					   == 29952 timer cycles
    // 1/50s = 29952 samples, or 1497600 samples/s
    //
    // ay clock: 1.75Mhz, 7/48 of pixelclock
    //
    var screen_time = 0;
    var instr_time = 0;
    var commit_time = -1;
    var commit_time_pal = -1;
    var irq = true;

    var raster_pixel = 0;
    var raster_line = 0;
    var fb_column = 0;
    var fb_row = 0;
    this.pixels = new Uint8Array(4);

    var between = 0;
    var sound = 0;
    var sound_avg_n = 0;

    this.aywrapper = new AYWrapper(ay);

    //var border_index_cached = this.IO.BorderIndex();
    this.border_index_cached = 0;
    self = this;
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


    this.oneInterrupt = function(mem, updateScreen) {
        var index = 0;
        var brk = false;
        var bmpofs = 0;

        for (; !brk;) {
            instr_time = 0;
            commit_time = commit_time_pal = -1;

            if (irq && this.CPU.iff) {
                irq = false;
                between = 0;
                // i8080js does not have halt mode, but loops on halt instruction
                // if in halt, advance pc + 1 and sideload rst7 instruction
                // this is a fairly close equivalent to what real 8080 is doing
                //if (mem[this.CPU.pc] == 0x76) { // 0x76 == hlt
                if (this.CPU.last_opcode == 0x76) { // 0x76 == hlt
                    this.CPU.pc += 1;
                }
                this.CPU.execute(0xf3);         // di
                this.CPU.execute(0xff); 		// 0xff == rst7
                instr_time += 16; 				// execution time known
                //debug_str = "";
            }

            var dbg_pc = this.CPU.pc;            
            // if (debug && dbg_pc == 0x158) {
            //     debugger;
            // }
            // execute next instruction and calculate time by rounding up tstates
            this.CPU.instruction(); 
            var dbg_op = this.CPU.last_opcode;
            // if (debug) {
            //     debug_str += "pc:" + dbg_pc.toString(16) + "; "
            //     if (this.CPU.pc == 0) {
            //         console.log(debug_str);
            //         debugger;
            //     }
            // }
            {
                var tstates = this.CPU.tstates;
                for (var i = 0, end = tstates.length; i < end; i += 1) {
                    if (tstates[i] > 4) {
                        instr_time += 8;
                    } else {
                        instr_time += 4;
                    }
                    if (dbg_op == 0xd3 && i == 1) {
                        commit_time = instr_time - 1;
                    }
                }
            }
            commit_time = commit_time * 4 + 4;
            commit_time_pal = commit_time - 20;

            // tick the timer (half of cpu cycles)
            sound += this.Timer.Count(instr_time / 2);
            sound_avg_n += 8; // so that it's not too loud

            this.aywrapper.step(instr_time);

            this.soundAccu += this.soundRatio * instr_time / 2;
            between += instr_time;
            if (this.soundAccu >= 1.0) {
                this.soundAccu -= 1.0;
                sound = 1.0 * sound / sound_avg_n + 
                    this.aywrapper.unload() + 
					//this.IO.TapeOut() + 
                    this.tapeout +
                    Math.random() * 0.005;
                this.soundnik.sample(sound - 0.5);
                sound_avg_n = sound = 0;
            }

            // fill pixels
            //var mode512 = this.IO.Mode512();
            var index_modeless = 0;
            for (var i = 0, end = instr_time * 4; i < end; i += 1) {
                // this offset is important for matching i/o writes 
                // (border and palette) and raster
                // test:bord2
                var rpixel = raster_pixel - 24;                
                var vborder = (raster_line < 40) || (raster_line >= (40 + 256));                
                var hborder = (rpixel < (768 - 512) / 2) ||
                    (rpixel >= (768 - (768 - 512) / 2));
                var border = hborder || vborder;
                if (updateScreen) {
                    if (border) {
                        index = this.border_index_cached;
                        fb_column = 0;
                    } else {
                        if (rpixel % 16 == 0) {
                            this.fetchPixels(fb_column, fb_row, mem);
                        }

                        // mode 256
                        if (raster_pixel % 2 == 0) {
                            index_modeless = ((this.pixels[0] & 0x80) >> 4) |
                                ((this.pixels[1] & 0x80) >> 5) |
                                ((this.pixels[2] & 0x80) >> 6) |
                                ((this.pixels[3] & 0x80) >> 7);
                            this.pixels[0] <<= 1;
                            this.pixels[1] <<= 1;
                            this.pixels[2] <<= 1;
                            this.pixels[3] <<= 1;
                        }
                        if (this.mode512) {
                            if (raster_pixel % 2 == 0) {
                                index = index_modeless & 0x03;
                            } else {
                                index = index_modeless & 0x0c;
                            }
                        } else {
                            index = index_modeless;
                        }

                        if (rpixel % 16 == 0) {
                            fb_column++;
                        }
                    }
                }

                // commit regular i/o writes (e.g. border index)
                // test: bord2
                if (i == commit_time) {
                    this.IO.commit();
                }
                // commit i/o to palette ram
                // test: bord2
                if (i == commit_time_pal) {
                    this.IO.commit_palette(index);
                }
                if (updateScreen) {
                    var bmp_x = raster_pixel - 100; // picture horizontal offset
                    if (bmp_x >= 0 && bmp_x < this.SCREEN_WIDTH) {
                        this.bmp[bmpofs] = this.Palette[index];
                        bmpofs += 1;
                    }
                }

                // 22 vsync
                // 18 border
                // 256 picture
                // 16 border
                raster_pixel++;
                if (raster_pixel == 768) {
                    raster_pixel = 0;
                    raster_line++;
                    if (!vborder) {
                        fb_row--;
                        if (fb_row < 0) {
                            fb_row = 0xff;
                        }
                    }
                    if (raster_line == 312) {
                        raster_line = 0;
                        brk = true;
                    }
                }
                // load scroll register at this precise moment
                // test:scrltst2
                if (raster_line == 22 + 18 && raster_pixel == 150) {
                    fb_row = this.IO.ScrollStart();
                }
                // irq time
                // test:bord2
                if (raster_line == 0 && raster_pixel == 176) {
                    irq = true;
                } else if (raster_line == 2) {
                    irq = false;
                }
            }
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

    this.twoFrame = function() {
        var frameRate = 25;

        this.oneInterrupt(this.Memory.bytes, true);
        this.oneInterrupt(this.Memory.bytes, false);
        this.displayFrame();

        var timeWaitUntilNextFrame = nextFrameTime - new Date().getTime();
        if (timeWaitUntilNextFrame < 0) {
            timeWaitUntilNextFrame = 0;
            nextFrameTime = new Date().getTime() + (1000 / frameRate);
        } else {
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
            setTimeout('v06c.twoFrame()', timeWaitUntilNextFrame);
        }
    };


    this.oneFrame = function() {
        var frameRate = 50;

        this.oneInterrupt(this.Memory.bytes, true);
        this.displayFrame();

        var timeWaitUntilNextFrame = nextFrameTime - new Date().getTime();
        if (timeWaitUntilNextFrame < 0) {
            timeWaitUntilNextFrame = 0;
            nextFrameTime = new Date().getTime() + (1000 / frameRate);
        } else {
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

    this.initCanvas();

    // start the dance
    this.BlkSbr = function() {
        pause_request = false;
        paused = false;
        this.CPU.pc = 0;
        this.CPU.sp = 0;
        this.CPU.iff = false;
        this.Timer.Write(3, 0x36);
        this.Timer.Write(3, 0x76);
        this.Timer.Write(3, 0xb6);
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
