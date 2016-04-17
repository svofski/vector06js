// vector-06js (c) 2016 Viacheslav Slavinsky
// AY kernel
// 
// Modified AY implementation from Emuscriptoria project
// https://sourceforge.net/projects/emuscriptoria/

"use strict";

function AY() {
		AY.prototype.rmask= [0xff, 0x0f, 0xff, 0x0f,
				0xff, 0x0f, 0x1f, 0xff,
				0x1f, 0x1f, 0x1f, 0xff,
				0xff, 0x0f, 0xff, 0xff];
		AY.prototype.amp= [0,      0.0137, 0.0205, 0.0291,
			  0.0423, 0.0618, 0.0847, 0.1369,
			  0.1691, 0.2647, 0.3527, 0.4499,
			  0.5704, 0.6873, 0.8482, 1];

		this.reset = function() {
			this.ayr= [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
				  0, 0, 0]; // last 3 values for tone counter
			this.envc = 0;
			this.envv = 0;
			this.envx = 0;
			this.ay13 = 0;
			this.tons = 0;
			this.noic = 0;
			this.noiv = 0;
			this.noir = 1;
		};

		this.cstep = function(ch) {
		  if( ++this.ayr[ch+16] >= (this.ayr[ch<<1] | this.ayr[1|ch<<1]<<8) )
			this.ayr[ch+16]= 0,
			this.tons^= 1 << ch;
		  return  ( ( this.ayr[7] >> ch   | this.tons >> ch )
				  & ( this.ayr[7] >> ch+3 | this.noiv       )
				  & 1 )  * AY.prototype.amp[ this.ayr[8+ch] & 0x10
						   ? this.envv
						   : this.ayr[8+ch] & 0x0f ];
		}

		this.estep = function() {
		  if( this.envx >> 4 ){
			if( this.ay13 & 1 )
			  return 7.5*((this.ay13>>1 ^ this.ay13) & 2);
			this.envx= 0;
			this.ay13^= this.ay13<<1 & 4;
		  }
		  return  this.ay13 & 4
				  ? this.envx++
				  : 15 - this.envx++;
		}

		this.step = function() {
		  if( ++this.envc >= (this.ayr[11]<<1 | this.ayr[12]<<9) )
			this.envc= 0,
			this.envv= this.estep();
		  if( ++this.noic >= this.ayr[6]<<1 )
			this.noic= 0,
			this.noiv= this.noir & 1,
			this.noir= (this.noir^this.noiv*0x24000)>>1;
		  return (this.cstep(0) + this.cstep(1) + this.cstep(2)) / 3;
		}

		this.aymute = function() {
		  if( ++this.envc >= (this.ayr[11]<<1 | this.ayr[12]<<9) ){
			this.envc= 0;
			if( this.envx >> 4 && ~this.ay13 & 1 )
			  this.envx= 0,
			  this.ay13^= this.ay13<<1 & 4;
		  }
		  if( ++this.noic >= this.ayr[6]<<1 )
			this.noic= 0,
			this.noiv= this.noir & 1,
			this.noir= (this.noir^this.noiv*0x24000)>>1;
		  if( ++this.ayr[16] >= (this.ayr[0] | this.ayr[1]<<8) )
			this.ayr[16]= 0,
			this.tons^= 1;
		  if( ++this.ayr[17] >= (this.ayr[2] | this.ayr[3]<<8) )
			this.ayr[17]= 0,
			this.tons^= 2;
		  if( ++this.ayr[18] >= (this.ayr[4] | this.ayr[5]<<8) )
			this.ayr[18]= 0,
			this.tons^= 4;
		}

		this.ayreg = 0;
		this.write = function(addr, val) {
			if (addr == 1) {
				this.ayreg = val & 0x0f;
			} else {
				this.ayr[this.ayreg]= val & AY.prototype.rmask[this.ayreg];
				if (this.ayreg == 13 )
					this.envx= 0,
					this.ay13= val & 8
						  ? 1 | val>>1 & 2 | val & 4
						  : val;
			}
		}

		this.read = function(addr) {
			if (addr == 1) {
				return this.ayreg;
			}
			return this.ayr[this.ayreg];
		}

		this.reset();
}

function AYWrapper(ay) {
	this.ay = ay;

	this.ayAccu = 0;
	this.aysamp = 0;
	this.aysamp_avg_n = 0;

	this.step = function(instr_time) {
        this.ayAccu += 7 * instr_time;
        while (this.ayAccu >= 96) {
            this.aysamp += ay.step();
            this.aysamp_avg_n += 1;
            this.ayAccu -= 96;
        }
	}

	this.unload = function() {
		var result = this.aysamp / this.aysamp_avg_n;
		this.aysamp = this.aysamp_avg_n = 0;
		return result;
	}

}
