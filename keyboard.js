// Vector-06js (c) 2016 Viacheslav Slavinsky
//
// Keyboard interface
//
function Keyboard() {
	this.matrix = new Uint8Array(8);
	this.ss = false;
	this.us = false;
	this.rus = false;
	this.onreset = function() {};

	this.cancelKeyEvent = function(e) {
		if (window.event) {
			try { window.event.keyCode = 0; } catch (e) { }
			window.event.returnValue = false;
			window.event.cancelBubble = true;
		}
		if (e.preventDefault) e.preventDefault();
		if (e.stopPropagation) e.stopPropagation();
	}

	var that = this;
	this.keyDown = function(e) {
		var keyCode = document.all? event.keyCode:e.which;
		keyboard.cancelKeyEvent(e);
		if (keyCode === 122 || keyCode === 123) { // F11, F12
			that.onreset(keyCode === 122);
		} else {
			keyboard.applyKey(keyCode,false);
		}
		return false;
	}

	this.keyUp = function(e) {
		var keyCode = document.all? event.keyCode:e.which;
		keyboard.cancelKeyEvent(e);
		if (keyCode === 122 || keyCode === 123) {
			// ignore reset keys
		} else {
			keyboard.applyKey(keyCode,true);
		}
		return false;
	}  

	// Keyboard encoding matrix:
	//   │ 7   6   5   4   3   2   1   0
	// ──┼───────────────────────────────
	// 7 │SPC  ^   ]   \   [   Z   Y   X
	// 6 │ W   V   U   T   S   R   Q   P
	// 5 │ O   N   M   L   K   J   I   H
	// 4 │ G   F   E   D   C   B   A   @
	// 3 │ /   .   =   ,   ;   :   9   8
	// 2 │ 7   6   5   4   3   2   1   0
	// 1 │F5  F4  F3  F2  F1  AP2 CTP ^\
	// 0 │DN  RT  UP  LT  ЗАБ ВК  ПС  TAB	
	keymap = {
		32: [7, 0x80], 192: [7, 0x40], 221: [7, 0x20], 220: [7, 0x10], 219: [7, 0x08],	90: [7, 0x04],	89: [7, 0x02],	88: [7, 0x01],
		87: [6, 0x80], 	86: [6, 0x40],	85: [6, 0x20],  84: [6, 0x10],	83: [6, 0x08],	82: [6, 0x04],	81: [6, 0x02],	80: [6, 0x01],
		79: [5, 0x80], 	78: [5, 0x40],	77: [5, 0x20],  76: [5, 0x10],	75: [5, 0x08],	74: [5, 0x04],	73: [5, 0x02],	72: [5, 0x01],
		71: [4, 0x80], 	70: [4, 0x40],	69: [4, 0x20],  68: [4, 0x10],	67: [4, 0x08],	66: [4, 0x04],	65: [4, 0x02], 191: [4, 0x01],
		191:[3, 0x80], 190: [3, 0x40], 187: [3, 0x20], 188: [3, 0x10], 186: [3, 0x08], 222: [3, 0x04],	57: [3, 0x02],	56: [3, 0x01],
		55: [2, 0x80], 	54: [2, 0x40],	53: [2, 0x20],  52: [2, 0x10],	51: [2, 0x08],	50: [2, 0x04],	49: [2, 0x02],	48: [2, 0x01],
		116:[1, 0x80], 115: [1, 0x40], 114: [1, 0x20], 113: [1, 0x10], 112: [1, 0x08],	27: [1, 0x04], 308: [1, 0x02], 220: [1, 0x01],
		40: [0, 0x80], 	39: [0, 0x40],	38: [0, 0x20],  37: [0, 0x10],   8: [0, 0x08],	13: [0, 0x04],	18: [0, 0x02],   9: [0, 0x01],
	};
	this.applyKey = function(sym, keyup) {
		//console.log("applyKey: sym=", sym, " keyup=", keyup);
		var apply, col, bit;
		if (keyup) {
			apply = function(mat, column, bv) {
				mat[column] &= ~bv;
			}
		} else {
			apply = function(mat, column, bv) {
				mat[column] |= bv;
			}
		}
		switch (sym) {
			// shift keys
			case 16:	this.ss = !keyup; break; 	// shift/ss
			case 17:	this.us = !keyup; break;	// ctrl/us
			case 117: 								// F6, cmd == rus
			case 91:
			case 93:	this.rus = !keyup; break;	// cmd/rus
			// matrix keys
			default:
				if (sym == 8 && this.ss) {
					sym = 308;
				}
				if (sym == 61) {
					//sym = plus;
					sym = 187;
				} else if (sym == 59) {
					sym = 186;
					//sym = semicolon;
				}
				//console.log("sym=", sym, " keymap: ", keymap[sym]);
				var colbit = keymap[sym];
				if (colbit) {
					col = colbit[0];
					bit = colbit[1];
				}
				if (col != undefined) {
					apply(this.matrix, col, bit);
				}
				break;
		}
		//debug = !keyup;
	}

	this.Read = function(row) {
		//console.log("kbd read, row=", row.toString(16));
		var result = 0;
		var rowbit = row;
		for (var i = 0; i < 8; i+=1) {
			if ((rowbit & 0x01) != 0) {
				result |= this.matrix[i];
			}
			rowbit >>= 1;
		}
		//console.log("kbd read=", result.toString(2));
		return (~result) & 0xff;
	}

	this.Hook = function() {
		document.onkeypress=function(){return false};
		document.onkeydown=this.keyDown;
		document.onkeyup=this.keyUp;
	}

	this.Unhook = function() {
		document.onkeypress=null
		document.onkeydown=null;
		document.onkeyup=null;
	}
}
