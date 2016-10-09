// vector-06js (c) 2016 Viacheslav Slavinsky
// AY kernel
// 
// Modified AY implementation from Emuscriptoria project
// https://sourceforge.net/projects/emuscriptoria/

"use strict";

/** @constructor */
function AY() {
    AY.prototype.rmask = [0xff, 0x0f, 0xff, 0x0f,
        0xff, 0x0f, 0x1f, 0xff,
        0x1f, 0x1f, 0x1f, 0xff,
        0xff, 0x0f, 0xff, 0xff
    ];
    AY.prototype.amp = [0, 0.0137, 0.0205, 0.0291,
        0.0423, 0.0618, 0.0847, 0.1369,
        0.1691, 0.2647, 0.3527, 0.4499,
        0.5704, 0.6873, 0.8482, 1
    ];

    this.reset = function() {
        this.ayr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0
        ]; // last 3 values for tone counter
        this.envc = 0;
        this.envv = 0;
        this.envx = 0;
        this.ay13 = 0;
        this.tons = 0;
        this.noic = 0;
        this.noiv = 0;
        this.noir = 1;
        this.ayreg = 0;
    };

    this.reset();
}

AY.prototype.cstep = function(ch) {
    if (++this.ayr[ch + 16] >= (this.ayr[ch << 1] | this.ayr[1 | ch << 1] << 8))
        this.ayr[ch + 16] = 0,
        this.tons ^= 1 << ch;
    return ((this.ayr[7] >> ch | this.tons >> ch) & (this.ayr[7] >> ch + 3 | this.noiv) & 1) * AY.prototype.amp[this.ayr[8 + ch] & 0x10 ? this.envv : this.ayr[8 + ch] & 0x0f];
};

AY.prototype.estep = function() {
    if (this.envx >> 4) {
        if (this.ay13 & 1)
            return 7.5 * ((this.ay13 >> 1 ^ this.ay13) & 2);
        this.envx = 0;
        this.ay13 ^= this.ay13 << 1 & 4;
    }
    return this.ay13 & 4 ? this.envx++
        : 15 - this.envx++;
};

AY.prototype.step = function() {
    if (++this.envc >= (this.ayr[11] << 1 | this.ayr[12] << 9))
        this.envc = 0,
        this.envv = this.estep();
    if (++this.noic >= this.ayr[6] << 1)
        this.noic = 0,
        this.noiv = this.noir & 1,
        this.noir = (this.noir ^ this.noiv * 0x24000) >> 1;
    return (this.cstep(0) + this.cstep(1) + this.cstep(2)) / 3;
};

AY.prototype.aymute = function() {
    if (++this.envc >= (this.ayr[11] << 1 | this.ayr[12] << 9)) {
        this.envc = 0;
        if (this.envx >> 4 && ~this.ay13 & 1)
            this.envx = 0,
            this.ay13 ^= this.ay13 << 1 & 4;
    }
    if (++this.noic >= this.ayr[6] << 1)
        this.noic = 0,
        this.noiv = this.noir & 1,
        this.noir = (this.noir ^ this.noiv * 0x24000) >> 1;
    if (++this.ayr[16] >= (this.ayr[0] | this.ayr[1] << 8))
        this.ayr[16] = 0,
        this.tons ^= 1;
    if (++this.ayr[17] >= (this.ayr[2] | this.ayr[3] << 8))
        this.ayr[17] = 0,
        this.tons ^= 2;
    if (++this.ayr[18] >= (this.ayr[4] | this.ayr[5] << 8))
        this.ayr[18] = 0,
        this.tons ^= 4;
};

AY.prototype.write = function(addr, val) {
    if (addr == 1) {
        this.ayreg = val & 0x0f;
    } else {
        this.ayr[this.ayreg] = val & AY.prototype.rmask[this.ayreg];
        if (this.ayreg == 13)
            this.envx = 0,
            this.ay13 = val & 8 ? 1 | val >> 1 & 2 | val & 4 : val;
    }
};

AY.prototype.read = function(addr) {
    if (addr == 1) {
        return this.ayreg;
    }
    return this.ayr[this.ayreg];
};


/** @constructor */
function AYWrapper(ay) {
    this.ay = ay;
    this.ayAccu = 0;
    this.instr_accu = 0;
    this.last = 0;
}

AYWrapper.prototype.step2 = function(instr_time) {
    this.ayAccu += 7 * instr_time;
    var aysamp = 0,
        avg = 0;
    for (; this.ayAccu >= 96; this.ayAccu -= 96) {
        aysamp += this.ay.step();
        avg += 1;
    }
    this.last = avg > 0 ? aysamp/avg : this.last;
    return this.last;
}

AYWrapper.prototype.step = function(instr_time) {
    this.instr_accu += instr_time;
};

AYWrapper.prototype.unload = function() {
    this.ayAccu += 7 * this.instr_accu;
    this.instr_accu = 0;
    var aysamp = 0,
        avg = 0;
    for (; this.ayAccu >= 96; this.ayAccu -= 96) {
        aysamp += this.ay.step();
        avg += 1;
    }

    var result = aysamp / avg;
    return result;
};
