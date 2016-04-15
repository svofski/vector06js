var debug = false;

function Memory() {
    this.bytes = new Uint8Array(65536 + 256 * 1024);
    for (var i = 0x0000; i < this.bytes.length; i++) {
        this.bytes[i] = 0; //Math.random() * 256;
    }

    mode_stack = false;
    mode_map = false;
    page_map = 0;
    page_stack = 0;

    this.control_write = function(w8) {
        //console.log("kvaz control_write: ", w8.toString(16));
        mode_stack = (w8 & 0x10) != 0;
        mode_map = (w8 & 0x20) != 0;
        page_map = ((~w8) & 3) + 1;
        page_stack = (((~w8) & 0xc) >> 2) + 1;
    }

    // 8000 -> 8000
    // a000 -> 8001   1010 0000 0000 0000 -> 1000 0000 0000 0001
    // c000 -> 8002
    // e000 -> 8003
    // 8001 -> 8004
    bigram_select = function(addr, stackrq) {
        if (!(mode_map | mode_stack)) {
            return addr;
        } else if (mode_stack && stackrq != undefined && stackrq) {
            return addr + (page_stack << 16);
        }
        if (mode_map && addr >= 0xa000 && addr < 0xe000) {
            return addr + (page_map << 16);
        }
        return addr;
    }

    this.read = function(addr, stackrq) {
        return this.bytes[bigram_select(addr & 0xffff, stackrq)];
    }

    this.write = function(addr, w8, stackrq) {
        this.bytes[bigram_select(addr & 0xffff, stackrq)] = w8;
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
        for (var i = 0; i < array.length; i++) {
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
                if (debug) {
                    console.log("in 0x02 result=", result.toString(16),
                        " PA=", PA.toString(16));
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
        // if (debug) {
        //     console.log("output pre: ", port.toString(16), w8.toString(16));
        //     if (port == 0 && w8 == 0) {
        //         //debugger;
        //     }
        // }
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
                }
                // if (debug) {
                //     console.log("output commit cw = ", CW.toString(16));
                // }
                break;
            case 0x01:
                PC = w8;
                break;
            case 0x02:
                PB = w8;
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
                this.palettebyte = w8;
                if (debug) {
                    console.log("out 0c=", w8, " color=", this.Palette[this.PB & 0x0f].toString(16));
                }
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
    var bmp;

    this.Memory = memory;
    this.CPU = cpu;
    this.IO = io;
    Timer = this.IO.Timer;

    // -sound
    /**
     * Offset into sndData for next sound sample.
     */
    this.sndCount = 0;
    this.sndReadCount = 0;
    this.cs = 0;

    /**
     * Buffer for sound event messages.
     */
    this.renderingBufferSize = 8192;
    this.mask = this.renderingBufferSize - 1;
    this.renderingBuffer = null;
    this.sampleRate = null;

    if (typeof AudioContext != "undefined") {
        console.debug("AudioContext found");

        this.audioContext = new AudioContext();
        this.sampleRate = this.audioContext.sampleRate;

        this.jsNode = this.audioContext.createScriptProcessor(2048, 0, 2);
        this.jsNode.connect(this.audioContext.destination);
        var that = this;
        this.jsNode.onaudioprocess = function(event) {
            var diff = (that.sndCount - that.sndReadCount) & that.mask;
            if (diff >= 2048) {
                var o = event.outputBuffer;
                var l = o.getChannelData(0);
                var r = o.getChannelData(1);

                for (var i = 0; i < 2048;) {
                    l[i] = r[i] = that.renderingBuffer[that.sndReadCount];
                    i += 1;
                    that.sndReadCount += 1;
                    l[i] = r[i] = that.renderingBuffer[that.sndReadCount];
                    i += 1;
                    that.sndReadCount += 1;
                    l[i] = r[i] = that.renderingBuffer[that.sndReadCount];
                    i += 1;
                    that.sndReadCount += 1;
                    l[i] = r[i] = that.renderingBuffer[that.sndReadCount];
                    i += 1;
                    that.sndReadCount += 1;
                }
                that.sndReadCount &= that.mask;
            } else {
                console.debug("audio starved");
            }
        }

        this.hasAudio = true;
    }

    if (this.hasAudio) {
        this.renderingBuffer = new Float32Array(this.renderingBufferSize);
    }

    // -sound

    var w, h, buf8, data2;
    var usingPackedBuffer = false;
    this.displayFrame = function() {
        if (bufferCanvas === undefined || this.SCREEN_WIDTH != w || this.SCREEN_HEIGHT != h) {
            bufferCanvas = document.createElement("canvas");
            w = bufferCanvas.width = this.SCREEN_WIDTH;
            h = bufferCanvas.height = this.SCREEN_HEIGHT;
            bufferContext = bufferCanvas.getContext("2d");
            console.log("bufferContext=", bufferContext.canvas);

            cvsDat = bufferContext.getImageData(0, 0, this.SCREEN_WIDTH, this.SCREEN_HEIGHT);
            //screenCanvas.width = bufferCanvas.width * 1.67;
            screenCanvas.width = bufferCanvas.width * 1; //1.67;
            screenCanvas.height = bufferCanvas.height * 1; //(2/1.67);

            usingPackedBuffer = (typeof Uint8ClampedArray !== "undefined") && (cvsDat.data.buffer);
            if (usingPackedBuffer) {
                console.debug("Using native packed graphics");
                var bmp2 = cvsDat.data.buffer;
                buf8 = new Uint8ClampedArray(bmp2);
                bmp = new Uint32Array(bmp2);
            } else {
                console.debug("Using manually unpacked graphics");
                buf8 = cvsDat.data;
                for (var loop = 0; loop < buf8.length; loop++) buf8[loop] = 0xFF;

                bmp = typeof(Int32Array) != "undefined" ? new Int32Array(this.SCREEN_WIDTH * this.SCREEN_HEIGHT) : new Array(this.SCREEN_WIDTH * this.SCREEN_HEIGHT);
            }
        }

        if (!usingPackedBuffer) {
            // have to manually unpack ints to bytes
            var fc;
            for (var i = 0, ix = 0; i < bmp.length; i += 1) {
                fc = bmp[i];
                buf8[ix + 0] = fc & 0xFF;
                buf8[ix + 1] = (fc >> 8) & 0xFF;
                buf8[ix + 2] = (fc >> 16) & 0xFF;
                ix += 4;
            }
        }
        bufferContext.putImageData(cvsDat, 0, 0);
        screenContext.drawImage(bufferCanvas, 0, 0, screenCanvas.width, screenCanvas.height);
    }

    // 1/2/3/4 1/2/3/4
    // 0 = 0000
    // 1 = 2000
    // 2 = 4000
    // 3 = 6000
    // addr = {addr[1:0],addr[14:0]}
    this.fetchPixels = function(column, row, mem, pixels) {
        var addr = ((column & 0xff) << 8) | (row & 0xff);
        pixels[3] = mem[0xe000 + addr];
        pixels[2] = mem[0xc000 + addr];
        pixels[1] = mem[0xa000 + addr];
        pixels[0] = mem[0x8000 + addr];
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
    var pixels = new Uint8Array(4);

    var soundRatio = this.sampleRate / 1497600.0;
    var soundAccu = 0.0;

    var between = 0;
    var sound = 0;
    var sound_avg_n = 0;
    var ayAccu = 0;
    var aysamp = 0.0;
    var aysamp_avg_n = 0;

    var border_index_cached = this.IO.BorderIndex();
    var Palette = this.IO.Palette;

    this.oneInterrupt = function(mem) {
        var index = 0;
        var brk = false;
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
                this.CPU.execute(0xff); 		// 0xff == rst7
                instr_time += 16; 				// execution time known
            }

            var dbg_pc = this.CPU.pc;            
            // execute next instruction and calculate time by rounding up tstates
            this.CPU.instruction(); 
            var dbg_op = this.CPU.last_opcode;
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
            sound += Timer.Count(instr_time / 2);
            sound_avg_n += 8; // so that it's not too loud

            // AY step
            ayAccu += 7 * instr_time;
            while (ayAccu >= 96) {
                aysamp += ay.step();
                aysamp_avg_n += 1;
                ayAccu -= 96;
            }
            //sound += aysamp;

            soundAccu += soundRatio * instr_time / 2;
            between += instr_time;
            if (soundAccu >= 1.0) {
                soundAccu -= 1.0;
                sound = 1.0 * sound / sound_avg_n + aysamp / aysamp_avg_n + 
					this.IO.TapeOut() + 
                    Math.random() * 0.005;
                sound_avg_n = 0;
                aysamp = 0;
                aysamp_avg_n = 0;
                var plus1 = (this.sndCount + 1) & this.mask;
                if (plus1 != this.sndReadCount) {
                    this.renderingBuffer[this.sndCount] = sound - 0.5;
                    this.sndCount = plus1;
                }
                sound = 0;
            }

            // fill pixels
            var mode512 = this.IO.Mode512();
            var index_full = 0;
            for (var i = 0, end = instr_time * 4; i < end; i += 1) {
            	// this offset is important for matching i/o writes 
            	// (border and palette) and raster
            	// test:bord2
                var rpixel = raster_pixel - 24;                
                var vborder = (raster_line < 40) || (raster_line >= (40 + 256));                
                var hborder = (rpixel < (768 - 512) / 2) ||
                    (rpixel >= (768 - (768 - 512) / 2));
                var border = hborder || vborder;

                if (border) {
                    index = border_index_cached;
                    fb_column = 0;
                } else {
                    if (rpixel % 16 == 0) {
                        this.fetchPixels(fb_column, fb_row, mem, pixels);
                    }

                    // mode 256
                    if (raster_pixel % 2 == 0) {
                        index_full = ((pixels[0] & 0x80) >> 4) |
                            ((pixels[1] & 0x80) >> 5) |
                            ((pixels[2] & 0x80) >> 6) |
                            ((pixels[3] & 0x80) >> 7);
                        pixels[0] <<= 1;
                        pixels[1] <<= 1;
                        pixels[2] <<= 1;
                        pixels[3] <<= 1;
                    }
                    if (mode512) {
                        if (raster_pixel % 2 == 0) {
                            index = index_full & 0x03;
                        } else {
                            index = index_full & 0x0c;
                        }
                    } else {
                        index = index_full;
                    }

                    if (rpixel % 16 == 0) {
                        fb_column++;
                    }
                }
                // commit regular i/o writes (e.g. border index)
                // test: bord2
                if (i == commit_time) {
                    this.IO.commit();
                    mode512 = this.IO.Mode512();
                    border_index_cached = this.IO.BorderIndex();
                }
                // commit i/o to palette ram
                // test: bord2
                if (i == commit_time_pal) {
                    this.IO.commit_palette(index);
                }
                // TODO: make this incremental
                var bmp_x = raster_pixel - 100; // picture horizontal offset
                if (bmp_x >= 0 && bmp_x < this.SCREEN_WIDTH) {
                    var bmpofs = raster_line * this.SCREEN_WIDTH + bmp_x;
                    bmp[bmpofs] = Palette[index];
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
                } else if (raster_line == 22) {
                    irq = false;
                }
            }
        }
    }

    this.initCanvas = function() {
        screenCanvas = document.getElementById("canvas");

        if (!screenCanvas.getContext) {
            alert("Your web browser does not support the 'canvas' tag.\nPlease upgrade/change your browser.");
        }
        screenContext = screenCanvas.getContext("2d");
        bufferCanvas = undefined;
        if (this.displayFrame) this.displayFrame();
        console.log("initCanvas: screnCanvas=", screenCanvas);
    }

    var nextFrameTime = new Date().getTime();
    var bytes = this.Memory.bytes;
    this.oneFrame = function() {
        var frameRate = 50;

        this.oneInterrupt(bytes);
        this.displayFrame()

        var timeWaitUntilNextFrame = nextFrameTime - new Date().getTime();
        if (timeWaitUntilNextFrame < 0) {
            //console.log("timeWaitUntilNextFrame < 0");
            timeWaitUntilNextFrame = 0;
            nextFrameTime = new Date().getTime() + (1000 / frameRate);
        } else {
            //console.log("timeWaitUntilNextFrame >= 0", timeWaitUntilNextFrame);
            nextFrameTime += (1000 / frameRate);
        }
        setTimeout('v06c.oneFrame()', timeWaitUntilNextFrame);
    }

    this.initCanvas();

    // start the dance
    this.BlkSbr = function() {
        this.CPU.execute(0xc7); // rst0
        this.oneFrame();
    }
}
