"use strict";

class Debugger
{
    constructor(v06c)
    {
        this.v06c = v06c;
        this.stopped = false;
        this.check_breakpoint = this.default_check_breakpoint;
        this.skip_cnt = 0;
        this.step_over_addr = -1;
        this.step_out_addr = -1;
        this.breakpoints = {};
        this.ignore_once_addr = -1;
    }

    command(data)
    {
        console.log("Debugger.command: data=", data);
        switch (data.subcmd) {
            case "pause":
                if (this.stopped) {
                    // continue
                    this.check_breakpoint = this.default_check_breakpoint;
                    this.stopped = false;
                }
                else {
                    this.v06c.dbg = this;
                    this.check_breakpoint = this.immediate_breakpoint;
                }
                break;
            case "step-in": // single instruction
                if (this.stopped) {
                    this.do_step_in();
                }
                break;
            case "step-over": // skip call/rst
                if (this.stopped) {
                    this.do_step_over();
                }
                break;
            case "step-out":  // trace until return
                if (this.stopped) {
                    this.do_step_out();
                }
                break;
            case "set-breakpoints":
                this.set_breakpoints(data.addrs);
                if (this.stopped) {
                    this.send_ok();
                }
                break;
            case "del-breakpoints":
                this.clear_breakpoints(data.addrs);
                if (this.stopped) {
                    this.send_ok();
                }
                break;
            case "set-register":
                if (this.stopped) {
                    this.set_register(data.regname, data.value);
                    if (data.regname === "pc") {
                        this.enter_breakpoint();
                    }
                    else {
                        this.send_ok();
                    }
                }
                break;
            case "write-byte":
                if (this.stopped) {
                    this.write_byte(data.addr, data.value);
                    this.send_ok();
                }
                break;
        }
    }

    do_step_in()
    {
        if (this.stopped) {
            this.v06c.dbg = this;
            this.skip_cnt = 1;
            this.check_breakpoint = this.step_in_breakpoint;
            this.stopped = false;
        }
    }

    do_step_over()
    {
        if (this.is_call_like()) {
            this.v06c.dbg = this;
            this.check_breakpoint = this.step_over_breakpoint;
            this.step_over_addr = this.next_pc_addr();
            this.stopped = false;
        }
        else {
            this.do_step_in();
        }
    }

    do_step_out()
    {
        if (this.stopped) {
            this.v06c.dbg = this;
            this.step_out_addr = -1;
            this.check_breakpoint = this.step_out_breakpoint;
            this.stopped = false;
            this.step_out_breakpoint(); // immediately check if stopped on a ret
        }
    }

    default_check_breakpoint()
    {
        let ignore = this.ignore_once_addr;
        this.ignore_once_addr = -1;
        if (ignore === this.v06c.CPU.pc) {
            return false;
        }
        if (this.breakpoints[this.v06c.CPU.pc]) {
            this.ignore_once_addr = this.v06c.CPU.pc;
            return true;
        }
        return false;
    }

    step_over_breakpoint()
    {
        if (this.step_over_addr == this.v06c.CPU.pc) {
            this.step_over_addr = null;
            this.check_breakpoint = this.default_check_breakpoint;
            return true;
        }
        return this.default_check_breakpoint();
    }

    step_in_breakpoint()
    {
        if (this.skip_cnt == 0) {
            return true;
        }
        --this.skip_cnt;
        return this.default_check_breakpoint();
    }

    step_out_breakpoint()
    {
        let cpu = this.v06c.CPU;
        if (this.step_out_addr == -1) {
            // single-step ret/conditional ret instruction to see if return happened
            let sp = cpu.sp;
            this.step_out_addr = this.v06c.CPU.memory_read_word(sp, /*stackrq*/true);
            return this.default_check_breakpoint();
        }
        if (cpu.pc == this.step_out_addr) {
            // returned to expected address
            this.step_out_addr = -1;
            this.check_breakpoint = this.default_check_breakpoint;
            return true;
        }
        return this.default_check_breakpoint();
    }

    set_breakpoints(addrs)
    {
        for (let a of addrs) {
            this.breakpoints[a] = 1;
        }
        this.v06c.dbg = this;
        this.check_breakpoint = this.default_check_breakpoint;
    }

    clear_breakpoints(addrs)
    {
        if (addrs.length == 0) {
            this.breakpoints = {};
            return;
        }
        for (let a of addrs) {
            delete this.breakpoints[a];
        }
    }

    set_register(regname, value)
    {
        let cpu = this.v06c.CPU;
        switch (regname) {
            case "af":
                cpu.regs[7] = value >> 8;
                cpu.retrieve_flags(value & 0xff);
                break;
            case "bc":
                cpu.regs[0] = value >> 8;
                cpu.regs[1] = value & 0xff;
                break;
            case "de":
                cpu.regs[2] = value >> 8;
                cpu.regs[3] = value & 0xff;
                break;
            case "hl":
                cpu.regs[4] = value >> 8;
                cpu.regs[5] = value & 0xff;
                break;
            case "sp":
                cpu.sp = value;
                break;
            case "pc":
                cpu.pc = value;
                break;
            case "iff":
                cpu.iff = value ? true : false;
                break;
        }
    }

    write_byte(addr, value)
    {
        this.v06c.Memory.write(addr, value, false);
    }

    immediate_breakpoint()
    {
        return true;
    }

    no_breakpoint()
    {
        return false;
    }

    get_cpu_state()
    {
        let cpu = this.v06c.CPU;
        let mem = new Uint8Array(65536);
        for (let i in mem) {
            mem[i] = this.v06c.Memory.read(i, false);
        }

        let s = {
            pc: cpu.pc,
            sp: cpu.sp,
            iff: cpu.iff,
            psw: cpu.store_flags(),
            regs: cpu.regs,
            mem: mem,
            mem_cw: this.v06c.Memory.cw,
            breakpoints: this.breakpoints,
        };
        return s;
    }

    enter_breakpoint()
    {
        this.stopped = true;
        window.parent.postMessage({type: "debugger", what: "stopped", "cpu_state": this.get_cpu_state()});
    }

    send_ok()
    {
        window.parent.postMessage({type: "debugger", what: "ok", "cpu_state": this.get_cpu_state()});
    }

    static call_like_insns = "CALL|CZ|CNZ|CP|CM|CC|CNC|CPO|CPE|RST";
    static ret_like_insns = "RET|RZ|RNZ|RP|RM|RC|RNC|RPO|RPE";

    is_smth_like(likeness)
    {
        let cpu = this.v06c.CPU;
        let insn = [cpu.memory_read_byte(cpu.pc),
            cpu.memory_read_byte((cpu.pc+1)) & 0xffff,
            cpu.memory_read_byte((cpu.pc+2)) & 0xffff]
        let dasm = I8080_disasm(insn);
        if (!dasm) return false;
        let cmd = dasm.cmd;
        if (cmd.endsWith('?')) {
            cmd = cmd.slice(0, cmd.length - 1);
        }
        return likeness.indexOf(dasm.cmd) != -1;
    }

    // return true for call, c*, rst n -- stuff we can step over
    is_call_like()
    {
        return this.is_smth_like(Debugger.call_like_insns);
    }

    is_ret_like()
    {
        return this.is_smth_like(Debugger.ret_like_insns);
    }

    next_pc_addr()
    {
        let cpu = this.v06c.CPU;
        let insn = [cpu.memory_read_byte(cpu.pc),
            cpu.memory_read_byte((cpu.pc+1)) & 0xffff,
            cpu.memory_read_byte((cpu.pc+2)) & 0xffff]
        //console.log("disasm: ", I8080_disasm(insn));
        let dasm = I8080_disasm(insn);
        if (!dasm) return cpu.pc + 1;
        return cpu.pc + dasm.length;
    }

};
