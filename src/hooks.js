function BufferStream(contents)
{
    this.buffer = contents;
    this.index = 0;
    this.next = 0;
    this.onfinished = null;

    // sync & 0x80 -> wait until 0xe6 (and skip it)
    this.nextbyte = function(sync) {
        if (!this.buffer || this.buffer.length == 0) {
            return 0;  // null buffer stream
        }

        var b = sync;
        while (this.index < this.buffer.length) {
            b = this.buffer[this.index];
            ++this.index;

            if ((sync & 0x80) != 0 && this.index > 1) {
                if (b == 0xe6) {
                    // sync found, continue to return following byte
                    sync = 0;
                }
                continue;
            }
            break;
        }

        if (this.index >= this.buffer.length) {
            this.onfinished && this.onfinished(this.next);
        }

        return b;
    };

    this.size = function() { return this.buffer.length; }
}

// basic load interceptors
// basic read byte 0x2b05
const signature_2b05 = [0xc5, 0xd5, 0x0e, 0x00, 0x57, 0xdb, 0x01];

Vector06c.prototype.exit_intercept = function()
{
    // return from the intercepted hook:
    // load return address from stack
    var ret = this.Memory.read(this.CPU.sp, true) + this.Memory.read(this.CPU.sp + 1, true) * 256;
    // advance SP
    this.CPU.sp += 2;
    // set PC to return address
    this.CPU.pc = ret;
    // continue execution
    this.script_continue();
};


Vector06c.prototype.check_signature = function(pc, signature)
{
    for (var i = 0; i < signature.length; ++i) {
        if (this.Memory.read(pc + i, false) != signature[i]) {
            return false;
        }
    }

    return true;
};

// intercept BASIC load byte routine
Vector06c.prototype.check_breakpoint = function()
{
    if (this.CPU.pc == 0x2b05) {
        return this.check_signature(this.CPU.pc, signature_2b05);
    }
    return false;
};

Vector06c.prototype.onbreakpoint = function()
{
    this.hook_2b05();        
};

// read byte
Vector06c.prototype.hook_2b05 = function()
{
    // basfile_loaded but zero size --> wav file being played
    if (!this.basfile || this.basfile.size() == 0) {
        this.script_continue();
    }
    else {
        // get parameter
        let a = this.CPU.a();

        // return next byte in A
        this.CPU.set_a(this.basfile.nextbyte(a));
        
        // return to the caller
        this.exit_intercept();
    }
};
