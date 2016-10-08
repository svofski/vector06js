"use strict";

/** @constructor */
function CounterUnit() {
    this.latch_value = 0;    
    this.write_state = 0;
    this.latch_mode = 3;

    this.out = 1;
    this.value = 0;
    this.mode_int = 0;
    this.armed = false;

    this.write_lsb = 0;
    this.write_msb = 0;
    this.loadvalue = undefined;
    this.load = false;
    this.enabled = false;
    this.read_period = 0;
    this.delay = 0;

    this.SetMode(0);
}

const WRITE_DELAY = 2;//2;//8;
const LATCH_DELAY = 1;
const READ_DELAY = 0;

CounterUnit.prototype.Latch = function(w8) {
    this.Count(LATCH_DELAY);
    this.delay = LATCH_DELAY;
    this.latch_value = this.value;
};

CounterUnit.prototype.SetMode = function(new_mode, new_latch_mode) {
    //this.Count(WRITE_DELAY);
    this.Count(LATCH_DELAY);
    this.delay = LATCH_DELAY;

    if ((new_mode & 0x04) == 2) {
        this.mode_int = 2;
    } else if ((new_mode & 0x04) == 3) {
        this.mode_int = 3;
    } else {
        this.mode_int = new_mode;
    }

    switch(this.mode_int) {
        case 0:
            this.out = 0;
            this.armed = true;
            this.enabled = false;
            break;
        case 1:
            this.out = 1;
            this.enabled = false;
            this.armed = true;
            break;
        case 2:
            this.out = 1;
            this.enabled = false;
            break;
        default:
            this.out = 1;
            this.enabled = false;

            break;
    }
    this.load = false;
    this.latch_mode = new_latch_mode;
    this.write_state = 0;
};

CounterUnit.prototype.write_value = function(w8) {
    if (this.latch_mode == 3) {
        // lsb, msb             
        switch (this.write_state) {
            case 0:
                this.write_lsb = w8;
                this.write_state = 1;
                break;
            case 1:
                this.write_msb = w8;
                this.write_state = 0;
                this.loadvalue = ((this.write_msb << 8) & 0xffff) | 
                    (this.write_lsb & 0xff);
                this.load = true;
                break;
            default:
                break;
        }
    } else if (this.latch_mode == 1) {
        // lsb only
        this.value = (this.value & 0xff00) | w8;
        this.value &= 0xffff;
        this.loadvalue = this.value;
        this.load = true;
    } else if (this.latch_mode == 2) {
        // msb only 
        this.value = (this.value & 0x00ff) | (w8 << 8);
        this.value &= 0xffff;
        this.loadvalue = this.value;
        this.load = true;
    }
    //
    if (this.load) {
        switch (this.mode_int) {
        case 0:
            this.delay = 3; break; // 4 makes chkvi53 happy, 3 makes 8253 happy
        case 1:
            if (!this.enabled) {
                this.delay = 3; // 82532: 3, 82531: 3, 8253: 4  
            } 
            break;
        case 2:
            if (!this.enabled) {
                this.delay = 3; 
            }
            break;
        case 3:
            if (!this.enabled) {
                this.delay = 3; 
            }
            break;
        default:
            this.delay = 4; break;
        }
    }
};

CounterUnit.prototype.read_value = function() {
    this.read_period = 0;
    var value;
    switch (this.latch_mode) {
    case 0:
        // impossibru
        break;
    case 1:
        value = this.latch_value ? this.latch_value : this.value;
        this.latch_value = undefined; 
        return value & 0xff;
    case 2:
        value = this.latch_value ? this.latch_value : this.value;
        this.latch_value = undefined; 
        return (value >> 8) & 0xff;
    case 3:
        value = this.latch_value ? this.latch_value : this.value;
        switch(this.write_state) {
        case 0:
            this.write_state = 1;
            return value & 0xff;
        case 1:
            this.latch_value = undefined;
            this.write_state = 0;
            return (value >> 8) & 0xff;
        default:
            break;
        }
        break;
    default:
        break;
    }
    return 0; // impossible
};

CounterUnit.prototype.Count = function(incycles) {
    this.read_period += incycles;
    var cycles = incycles;
    while (this.delay && cycles) {
        --this.delay;
        --cycles;
    }
    if (!cycles) return;

     switch (this.mode_int) {
        case 0: // Interrupt on terminal count
            if (this.load) {
                this.value = this.loadvalue;
                this.enabled = true;
                this.armed = true;
                this.load = false;
                this.out = 0;
            }
            if (this.enabled) {
                this.value -= cycles;
                if (this.value <= 0) {
                    this.value += 65536;
                    if (this.armed) {
                        this.out = 1;
                        this.armed = false;
                    }
                }
            }
            break;
        case 1: // Programmable one-shot
            if (!this.enabled && this.load) {
                //this.value = this.loadvalue; -- quirk!
                this.enabled = true;
            }
            this.load = false;
            if (this.enabled && cycles > 0) {
                this.value -= cycles;
                if (this.value <= 0) {
                    this.value += this.loadvalue + 1;
                    //this.value += this.loadvalue;
                }
            }

            break;
        case 2: // Rate generator
            if (!this.enabled && this.load) {
                this.value = this.loadvalue;
                this.enabled = true;
            }
            this.load = false;
            if (this.enabled && cycles > 0) {
                this.value -= cycles;
                if (this.value <= 0) {
                    this.value += this.loadvalue;
                }
            }
            // out will go low for one clock pulse but in our machine it should not be 
            // audible
            break;
        case 3: // Square wave generator
            if (!this.enabled && this.load) {
                this.value = this.loadvalue;
                this.enabled = true;
            }
            this.load = false;
            if (this.enabled && cycles > 0) {
                for (;--cycles >= 0;) {
                    this.value -= 
                        (this.value == this.loadvalue && (this.value&1 == 1)) ? 
                            this.out === 0 ? 3 : 1 : 2; 
                    if (this.value == 0) {
                        this.value = this.loadvalue;
                        this.out ^= 1;
                    }
                }
            }
            break;
        case 4: // Software triggered strobe
            break;
        case 5: // Hardware triggered strobe
            break;
        default:
            break;
    }

    return this.out;
};

/** @constructor */
function I8253() {
	this.counters = [new CounterUnit(), new CounterUnit(), new CounterUnit()];
    this.control_word = 0;
}

I8253.prototype.write_cw = function(w8) {
	this.control_word = w8;

    var counter_set = (w8 >> 6) & 3;
    var mode_set = (w8 >> 1) & 3;
    var latch_set = (w8 >> 4) & 3;
    var bcd_set = (w8 & 1);

    var ctr = this.counters[counter_set];
	if (latch_set === 0) {
    	ctr.Latch(latch_set);
	} else {
		ctr.SetMode(mode_set, latch_set);
	}
};

I8253.prototype.Write = function(addr, w8) {
    console.log("8253 write " + addr + " = " + w8.toString(16));
    switch (addr & 3) {
        case 0x03:
            return this.write_cw(w8);
        default:
            return this.counters[addr & 3].write_value(w8);
    }
};

I8253.prototype.Read = function(addr) {
    switch (addr & 3) {
        case 0x03:
            return this.control_word;
        default:
            var v = this.counters[addr & 3].read_value();
            console.log("8253 read " + addr + " = " + v.toString(16));
            return v;
            //return this.counters[addr & 3].read_value();
    }
};

I8253.prototype.Count = function(cycles) {
    return this.counters[0].Count(cycles) +
         this.counters[1].Count(cycles) +
         this.counters[2].Count(cycles);
};

/** @constructor */
function TimerWrapper(timer) {
    this.timer = timer;
    this.sound = 0;
    this.average_count = 0;
}

TimerWrapper.prototype.step = function(cycles) {
    this.sound += this.timer.Count(cycles);
    this.average_count += 8; // so that it's not too loud
};

TimerWrapper.prototype.unload = function() {
    var result = this.sound / this.average_count;
    this.sound = this.average_count = 0;
    return result;
};
