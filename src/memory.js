"use strict";

/** @constructor
    @export */
function Memory() {
    // Memory is not linear to make pixel fetch one 32-bit access
    // see Memory.tobank() and PixelFiller.fetchPixels()
    // 0000,2000,4000,6000,0001,2001,... 
    this.bytes = new Uint8Array(65536 + 256 * 1024);
    this.bootbytes = undefined;

    for (var i = 0x0000; i < this.bytes.length; i++) {
        this.bytes[i] = 0;
    }

    this.mode_stack = false;
    this.mode_map = 0;
    this.page_map = 0;
    this.page_stack = 0;
}

Memory.prototype.control_write = function(w8) {
    this.mode_stack = (w8 & 0x10) !== 0;
    this.mode_map = w8 & 0xe0;
    this.page_map = ((w8 & 3) + 1) << 16;
    this.page_stack = (((w8 & 0xc) >> 2) + 1 << 16);
};

Memory.prototype.bigram_select = function(addr, stackrq) {
    if (!(this.mode_map || this.mode_stack)) {
        return addr;
    } else if (this.mode_stack && stackrq !== undefined && stackrq) {
        return addr + this.page_stack;
    //} else if (this.mode_map && addr >= 0xa000 && addr < 0xe000) {
    }
    else if ((this.mode_map & 0x20) && (addr >= 0xa000) && (addr <= 0xdfff)) {
        return addr + this.page_map;
    }
    else if ((this.mode_map & 0x40) && (addr >= 0x8000) && (addr <= 0x9fff)) {
        return addr + this.page_map;
    } else if ((this.mode_map & 0x80) && (addr >= 0xe000) && (addr <= 0xffff)) {
        return addr + this.page_map;
    }
    return addr;
};

Memory.prototype.tobank = function(a) {
    return (a&0x78000) | ((a<<2)&0x7ffc) | ((a>>13)&3 );
};

Memory.prototype.toflat = function(b) {
    return (a&0x78000) | ((a&0x7ffc)>>2) | ((a&3)<<13);
};

Memory.prototype.read = function(addr, stackrq) {
    if (this.bootbytes && addr < this.bootbytes.length) {
        return this.bootbytes[addr];
    }
    return this.bytes[this.tobank(this.bigram_select(addr & 0xffff, stackrq))];
};

Memory.prototype.write = function(addr, w8, stackrq) {
    this.bytes[this.tobank(this.bigram_select(addr & 0xffff, stackrq))] = w8;
};

Memory.prototype.init_from_array = function(array, start_addr) {
    var i, end;
    for (i = this.bytes.length; --i >= 0;) {
        this.bytes[i] = 0;
    }
    for (i = 0, end = array.length; i < end; i++) {
        this.write(start_addr + i, array[i], false);
    }
};

Memory.prototype.attach_boot = function(array) {
    this.bootbytes = new Uint8Array(array.length);
    for (var i = array.length; --i >= 0;) {
        this.bootbytes[i] = array[i];
    }
};

Memory.prototype.detach_boot = function() {
    this.bootbytes = undefined;
};

Memory.prototype.dump = function() {
    var s = "";
    var addr = 0;
    for (var i = 0; i < 8192;) {
        s += this.read(i).toString(16) + " ";
        ++i;
        if (i % 16 === 0) {
            console.log(addr.toString(16) + "  " + s);
            s = "";
            addr += 16;
        }
    }
};
