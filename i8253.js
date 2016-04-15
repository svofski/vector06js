function Counter() {
    var value = 0;
    var reload = 0;
    var latch_value = 0;
    var out = 1;
    var loaded = false;
    var write_state = 0;
    var mode_int = 0;
    var latch_mode = 3;

    this.Latch = function(w8) {
		latch_value = value;
    }

    this.SetMode = function(new_mode) {
        mode_int = new_mode;
        write_state = 0;
        loaded = false;
    }

    this.Count = function(cycles) {
        if (!loaded) {
            out = 0;
            return 0;
        }
        switch (mode_int) {
            case 0: // Interrupt on terminal count
                for (var i = 0; i < cycles && value > 0; i++) {
                    value--;
                }
                if (value == 0) {
                    out = 1;
                }
                break;
            case 1: // Programmable one-shot
                for (var i = 0; i < cycles && value > 0; i++) {
                    value--;
                }
                out = value > 0 ? 1 : 0;
                break;
            case 2: // Rate generator
				out = 1;
				for (var i = 0; i < cycles; i+=1) {
					if (--value == 0) {
						value = reload;
						out = 0;
					}
				}
                break;
            case 3: // Square wave generator
                if ((value & 1) == 0 && value >= cycles * 2) {
                    value -= cycles * 2;
                    if (value == 0) {
                        value = reload;
                        out = out == 0 ? 1 : 0;
                    }
                } else {
                    for (var i = 0; i < cycles; i++) {
                        value -= (value & 1) == 0 ? 2 :
                            out == 0 ? 1 : 3;

                        if (value == 0) {
                            value = reload;
                            out = out == 0 ? 1 : 0;
                        }
                    }
                }
                break;
            case 4: // Software triggered strobe
                break;
            case 5: // Hardware triggered strobe
                break;
        }
        return out;
    }

    this.SetMode(0);

    this.WriteCounter = function(w8) {
        loaded = false;
        if (latch_mode == 3) {
            // lsb, msb
            switch (write_state) {
                case 0:
                    value = w8 & 0xff;
                    write_state = 1;
                    break;
                case 1:
                    value = (value | (w8 << 8)) & 0xffff;
                    write_state = 0;
                    reload = value;
                    loaded = true;
                    break;
            }
        } else if (latch_mode == 1) {
            // lsb only
            value = (value & 0xff00) | w8;
            value &= 0xffff;
            reload = value;
            loaded = true;
        } else if (latch_mode == 2) {
            // msb only	
            value = (value & 0x00ff) | (w8 << 8);
            value &= 0xffff;
            reload = value;
            loaded = true;
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
			return value & 0xff;
		case 2:
			return (value >> 8) & 0xff;
		case 3:
			switch(write_state) {
			case 0:
				write_state = 1;
				return value & 0xff;
			case 1:
				write_state = 0;
				return (value >> 8) & 0xff;
			}
			alert("impossibru");
			break;
		}
    }
}


function I8253() {
    var ctr0 = new Counter(),
        ctr1 = new Counter(),
        ctr2 = new Counter();

    var control_word = 0;

    this.write_cw = function(w8) {
    	control_word = w8;

        var counter_set = (w8 >> 6) & 3;
        var mode_set = (w8 >> 1) & 3;
        var latch_set = (w8 >> 4) & 3;
        var bcd_set = (w8 & 1);

        var ctr;
        switch (counter_set) {
            case 0:
                ctr = ctr0;
                break;
            case 1:
                ctr = ctr1;
                break;
            case 2:
                ctr = ctr2;
                break;
        }
		if (latch_set == 0) {
        	ctr.Latch(latch_set);
		} else {
			ctr.SetMode(mode_set);
		}
    }

    this.write_ctr = function(c, w8) {
        switch (c) {
            case 0:
                ctr0.WriteCounter(w8);
                break;
            case 1:
                ctr1.WriteCounter(w8);
                break;
            case 2:
                ctr2.WriteCounter(w8);
                break;
        }
    }

    this.read_cw = function() {
        return control_word;
    }

    this.read_ctr = function(c) {
        switch (c) {
            case 0:
                return ctr0.read_value();
                break;
            case 1:
                return ctr1.read_value();
                break;
            case 2:
                return ctr2.read_value();
                break;
        }
    }

    this.Count = function(cycles) {
        return ctr2.Count(cycles) + ctr1.Count(cycles) + ctr0.Count(cycles);
    }

    this.Write = function(addr, w8) {
        switch (addr & 3) {
            case 0x03:
                return this.write_cw(w8);
            default:
                return this.write_ctr(addr & 3, w8);
        }
    }

    this.Read = function(addr) {
        switch (addr & 3) {
            case 0x03:
                return this.read_cw();
            default:
                return this.read_ctr(addr & 3);
        }
    }
}
