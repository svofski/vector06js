"use strict";

function Counter() {
    var reload = 0;
    var latch_value = 0;    
    var write_state = 0;
    var latch_mode = 3;

    this.out = 1;
    this.value = 0;
    this.mode_int = 0;
    this.loaded = false;

    this.catchup = 0;


    this.Latch = function(w8) {
		latch_value = this.value;
    }

    this.SetMode = function(new_mode, new_latch_mode) {
        this.mode_int = new_mode;
        latch_mode = new_latch_mode;
        write_state = 0;
        this.loaded = false;
        this.catchup = -4;
    }

    this.Count = function(cycles) {
        if (!this.loaded) {
            this.out = 0;
            return 0;
        }

        // this hack shows better results in I8253.rom but makes SkyNet whine
        // and emulator detection detects it anyway
        // if (this.catchup < 0) {
        //     this.catchup += cycles;
        //     if (this.catchup > 0) {
        //         cycles = this.catchup;
        //         this.catchup = 0;
        //     }
        // }

        switch (this.mode_int) {
            case 0: // Interrupt on terminal count
                for (var i = 0; i < cycles && this.value > 0; i++) {
                    this.value--;
                }
                if (this.value == 0) {
                    this.out = 1;
                }
                break;
            case 1: // Programmable one-shot
                for (var i = 0; i < cycles && this.value > 0; i += 1) {
                    this.value--;
                }
                this.out = this.value > 0 ? 1 : 0;
                break;
            case 2: // Rate generator
				this.out = 1;
				for (var i = 0; i < cycles; i+=1) {
					if (--this.value == 0) {
						this.value = reload;
						this.out = 0;
					}
				}
                break;
            case 3: // Square wave generator
            	if ((this.value & 1) == 1) {
            		this.value -= this.out == 0 ? 1 : 3;
            		--cycles;
            	}

            	this.value -= cycles * 2;
            	if (this.value <= 0) {
            		this.value += reload;
            		this.out = this.out == 0 ? 1 : 0;
            	}
                break;
            case 4: // Software triggered strobe
                break;
            case 5: // Hardware triggered strobe
                break;
        }

        return this.out;
    }

    this.SetMode(0);

    this.write_value = function(w8) {
        this.loaded = false;
        if (latch_mode == 3) {
            // lsb, msb
            switch (write_state) {
                case 0:
                    this.value = w8 & 0xff;
                    write_state = 1;
                    break;
                case 1:
                    this.value = (this.value | (w8 << 8)) & 0xffff;
                    write_state = 0;
                    reload = this.value;
                    this.loaded = true;
                    break;
            }
        } else if (latch_mode == 1) {
            // lsb only
            this.value = (this.value & 0xff00) | w8;
            this.value &= 0xffff;
            reload = this.value;
            this.loaded = true;
        } else if (latch_mode == 2) {
            // msb only	
            this.value = (this.value & 0x00ff) | (w8 << 8);
            this.value &= 0xffff;
            reload = this.value;
            this.loaded = true;
        }
    }

    this.read_value = function() {
		switch (latch_mode) {
		case 0:
			switch(write_state) {
			case 0:
				write_state = 1;
				return latch_value & 0xff;
			case 1:
				write_state = 0;
				return (latch_value >> 8) & 0xff;
			}
			alert("impossibru");
			break;
		case 1:
			return this.value & 0xff;
		case 2:
			return (this.value >> 8) & 0xff;
		case 3:
			switch(write_state) {
			case 0:
				write_state = 1;
				return this.value & 0xff;
			case 1:
				write_state = 0;
				return (this.value >> 8) & 0xff;
			}
			alert("impossibru");
			break;
		}
    }
}


function I8253() {
	this.counters = [new Counter(), new Counter(), new Counter()];

    this.control_word = 0;

    this.write_cw = function(w8) {
    	this.control_word = w8;

        var counter_set = (w8 >> 6) & 3;
        var mode_set = (w8 >> 1) & 3;
        var latch_set = (w8 >> 4) & 3;
        var bcd_set = (w8 & 1);

        var ctr = this.counters[counter_set];
		if (latch_set == 0) {
        	ctr.Latch(latch_set);
		} else {
			ctr.SetMode(mode_set, latch_set);
		}
    }

    this.read_ctr = function(c) {
    	return this.counters[c].read_value();
    }

    this.Count = function(cycles) {
        return this.counters[0].Count(cycles) +
         	this.counters[1].Count(cycles) +
         	this.counters[2].Count(cycles);

    }

    this.Write = function(addr, w8) {
        switch (addr & 3) {
            case 0x03:
                return this.write_cw(w8);
            default:
                return this.counters[addr & 3].write_value(w8);
        }
    }

    this.Read = function(addr) {
        switch (addr & 3) {
            case 0x03:
                return this.control_word;
            default:
                return this.counters[addr & 3].read_value();
        }
    }
}

function TimerWrapper(timer) {
    this.timer = timer;
    this.sound = 0;
    this.average_count = 0;

    this.step = function(cycles) {
        this.sound += this.timer.Count(cycles);
        this.average_count += 8; // so that it's not too loud
    }

    this.unload = function() {
        var result = this.sound / this.average_count;
        this.sound = this.average_count = 0;
        return result;
    }
}
