// fd1793.js from Videoton TV-Computer project by Bela Babik
// https://github.com/teki/jstvc

//define(["scripts/utils.js"], function(Utils) {

function Utils_() {    
  this.toHex8 = function (x) {
    var s = x.toString(16).toUpperCase();
    return "0".slice(s.length - 1) + s;
  };

  this.toHex16 = function (x) {
    var s = x.toString(16).toUpperCase();
    return "000".slice(s.length - 1) + s;
  };
}

var Utils = new Utils_();

function Floppy() {
    var exports = {};

    var idiv = function(a, b) {
        return ~~(a / b);
    };

    // buffer tools
    var bufferAlloc = function(size, data) {
        var buf = new Uint8Array(size);
        if (data) {
            if (typeof(data) == "string") {
                for (var i = 0; i < size; i++) {
                    buf[i] = data.charCodeAt(i);
                }
            } else {
                for (var i = 0; i < size; i++) {
                    buf[i] = data[i];
                }
            }
        }
        return buf;
    };

    var bufferSeek = function(buffer, offset, absolute) {
        var buf = buffer.buffer;
        var bufOffset = (absolute ? 0 : buffer.byteOffset) + offset;
        if (bufOffset >= buf.length || bufOffset < 0)
            throw ("BUFFER: out of range");
        return new Uint8Array(buf, bufOffset);
    };

    var bufferCopyStr = function(buffer, offset, str) {
        for (var i = 0; i < str.length; i++) {
            buffer[offset + i] = str.charCodeAt(i);
        }
    };

    var bufferCopyData = function(buffer, offset, data) {
        for (var i = 0; i < data.length; i++) {
            buffer[offset + i] = data[i];
        }
    };

    var bufferStrCmp = function(buffer, offset, str) {
        for (var i = 0; i < str.length; i++) {
            if (buffer[offset + i] != str.charCodeAt(i)) return 1;
        }
        return 0;
    };

    var bufferGetStr = function(buffer, offset, length) {
        var str = "";
        for (var i = 0; i < length; i++) {
            str += String.fromCharCode(buffer[offset + i]);
        }
        return str;
    };

    var bufferHexdump = function(buffer, offset, length) {
        var str = "";
        for (var i = 0; i < length; i++) {
            if (str) str += " ";
            str += Utils.toHex8(buffer[offset + i]);
        }
        return str;
    };

    // disk
    function FDisk() {
        this.log = false;
        this.dsk = null;
        this.sectorsPerTrack = 9;
        this.sectorSize = 512;
        this.totSec = 720;
        this.numHeads = 1;
        this.tracksPerSide = (this.totSec / this.sectorsPerTrack / this.numHeads) | 0;
        this.data = 0;
        this.track = 0;
        this.side = 0;
        this.position = 0;
        // read helpers
        this.readOffset = 0;
        this.readLength = 0;
        this.readSource = 0; // 0: dsk, 1: readBuffer
        this.readBuffer = new Uint8Array(6);
        this.sectorLengthTable = {
            128: 0,
            256: 1,
            512: 2,
            1024: 3
        };
    }

    FDisk.prototype.isReady = function() {
        return this.dsk !== null;
    };

    FDisk.prototype.loadDsk = function(name, dsk) {
        this.name = name;
        this.dsk = bufferAlloc(dsk.length, dsk);
        //this.parse();
        this.parse_v06c();
    };

    FDisk.prototype.seek = function(track, sector, side) {
        if (this.dsk !== null) {
            var offsetSector = (sector !== 0) ? (sector - 1) : 0;
            this.position = (track * (this.sectorsPerTrack * this.numHeads) + (this.sectorsPerTrack * side) + offsetSector) * this.sectorSize;
            this.track = track;
            this.side = side;
            //if (this.log)
                console.log("FD1793: disk seek position:", Utils.toHex16(this.position), "(side:" + this.side + ",trk:" + this.track + ",sec:" + sector + ")");
        }
    };

    FDisk.prototype.readSector = function(sector) {
        this.readLength = this.sectorSize;
        this.readOffset = 0;
        this.readSource = 0;
        this.sector = sector;
        this.seek(this.track, this.sector, this.side);
    };

    FDisk.prototype.readAddress = function() {
        this.readLength = 6;
        this.readSource = 1;
        this.readOffset = 0;
        this.readBuffer[0] = this.track;
        this.readBuffer[1] = this.side; // invert side ? not sure
        this.readBuffer[2] = this.sector;
        this.readBuffer[3] = this.sectorLengthTable[this.sectorSize];
        this.readBuffer[4] = 0;
        this.readBuffer[5] = 0;
    };

    FDisk.prototype.read = function() {
        var finished = true;
        if (this.readOffset < this.readLength) {
            finished = false;
            if (this.readSource) {
                this.data = this.readBuffer[this.readOffset];
            } else {
                this.data = this.dsk[this.position + this.readOffset];
            }
            this.readOffset++;
        } else {
            if (this.log)
                console.log("FD1793: read finished src:", this.readSource);
        }
        //console.log("FD1793: disk read, rem:",this.readLength,"finished:",finished);
        return finished;
    };

    
    // Vector-06c floppy: 2 sides, 5 sectors of 1024 bytes
    FDisk.prototype.parse_v06c = function() {
        const FDD_NSECTORS = 5;

        if (!this.isReady()) {
            console.warn("FD1793: no disk");
            return;
        }
        this.tracksPerSide = (this.dsk.length >> 10) / 2*FDD_NSECTORS;
        this.numHeads = 2;
        this.sectorSize = 1024;
        this.sectorsPerTrack = 5;
        this.totSec = this.dsk.length / 1024;
    };

    /*
    FDisk.prototype.parse = function() {
        //console.log("FD1793: disk dump begin");
        if (!this.isReady()) {
            console.warn("FD1793: no disk");
            return;
        }
        if (this.dsk[0] == 0xEB) {
            if (this.dsk[2] != 0x90)
                console.log("FD1793: not really msdos compatible:", bufferHexdump(this.dsk, 0, 3));
        } else if (this.dsk[0] != 0xE9) {
            console.warn("FD1793: non msdos disk!");
            return;
        }
        //console.log("FD1793: creator:", bufferGetStr(this.dsk, 3, 7));
        var sectorSize = this.dsk[11] + this.dsk[12] * 256;
        //console.log("FD1793: sector size:", sectorSize);
        var sectorsPerCluster = this.dsk[13];
        //console.log("FD1793: sectors per cluster:", sectorSize);
        var rsvdSecCnt = this.dsk[14] + this.dsk[15] * 256;
        //console.log("FD1793: reserved sectors (1):", rsvdSecCnt);
        var numFat = this.dsk[16];
        //console.log("FD1793: count of FAT data sctructures (2):", numFat);
        var rootEntCnt = this.dsk[17] + this.dsk[18] * 256;
        //console.log("FD1793: count of 32b dir entries in root:", rootEntCnt);
        var totSec = this.dsk[19] + this.dsk[20] * 256;
        //console.log("FD1793: total sector count:", totSec);
        //console.log("FD1793: media:",bufferHexdump(this.dsk,21,1));
        var fatSize = this.dsk[22] + this.dsk[23] * 256;
        //console.log("FD1793: fat entry size (sectors):", fatSize);
        var secPerTrk = this.dsk[24] + this.dsk[25] * 256;
        //console.log("FD1793: sectors per track:", secPerTrk);
        var numHeads = this.dsk[26] + this.dsk[27] * 256;
        //console.log("FD1793: number of heads:", numHeads);
        //console.log("FD1793: hidden sec:", bufferHexdump(this.dsk, 28,4));
        //console.log("FD1793: total sector count 32:", bufferHexdump(this.dsk, 32,4));
        //console.log("FD1793: drive number:", bufferHexdump(this.dsk, 36,1));

        var rootDirSectors = Math.ceil(rootEntCnt * 32 / sectorSize);

        var dataSec = totSec - (rsvdSecCnt + (numFat * fatSize) + rootDirSectors);

        var countOfClusters = Math.floor(dataSec / sectorsPerCluster);

        //console.log("FD1793: count of clusters:",countOfClusters);


        //console.log("FD1793: disk dump finished");

        this.sectorSize = sectorSize;
        this.sectorsPerTrack = secPerTrk;
        this.totSec = totSec;
        this.numHeads = numHeads;
        this.tracksPerSide = (this.totSec / this.sectorsPerTrack / this.numHeads) | 0;
    };
    */

    // fdc
    const ST_NOTREADY = 0x80; // sampled before read/write
    const ST_READONLY = 0x40;
    const ST_HEADLOADED = 0x20;
    const ST_RECTYPE = 0x20;
    const ST_WRFAULT = 0x20;
    const ST_SEEKERR = 0x10;
    const ST_RECNF = 0x10;
    const ST_CRCERR = 0x08;
    const ST_TRACK0 = 0x04;
    const ST_LOSTDATA = 0x04;
    const ST_INDEX = 0x02;
    const ST_DRQ = 0x02;
    const ST_BUSY = 0x01;

    const PRT_INTRQ = 0x01;
    const PRT_DRQ = 0x80;

    const CMD_READSEC = 1;
    const CMD_READADDR = 2;


    // Delays, not yet implemented:
    //   A command and between the next status: mfm 14us, fm 28us
    // Reset
    //  - registers cleared
    //  - restore (03) command
    //  - steps until !TRO0 goes low (track 0)
    //
    function FD1793() {
        this._log = false;
        this._disks = [new FDisk(), new FDisk(), new FDisk(), new FDisk()];
        // port 4, parameter register
        // SS,MON,DDEN,HLD,DS3,DS2,DS1,DS0
        // side select: 0: side 0, 1: side 1
        // motor on: 1: motor on
        // double density: 1: on
        // hold: 1: head on disk (it is or-ed with motor on)
        // drive select: 1: drive active
        this._pr = 0;
        this._side = 0;
        this._dsk = this._disks[0];
        this._intrq = 0;
        // Data Request - a byte is transferred
        // Cleared when the _data is read/written
        this._data = 0;
        // current track
        this._track = 0;
        // target sector
        this._sector = 0;
        // Command
        // busy bit is set
        // intrq reset
        this._command = 0;
        this._commandtr = 0;
        // Status
        // intrq reset
        //
        this._status = 0;
        this._address = new Uint8Array(8);
        this._addressidx = 0;

        this.LINGER_BEFORE = -20;
        this.LINGER_AFTER = 20;
        this._lingertime = this.LINGER_AFTER + 1;
        this._stepdir = 1;
    }

    FD1793.prototype.loadDsk = function(drive, name, dsk) {
        if (drive < 0 || drive > 3) throw ("FD1793: illegal drive:", drive);
        if (this._log) console.log("FD1793: loadDsk: " + name);
        this._disks[drive].loadDsk(name, dsk);
    };

    FD1793.prototype.exec = function() {
        var finished;
        if (this._commandtr == CMD_READSEC || this._commandtr == CMD_READADDR) {
            if (this._status & ST_DRQ) throw ("invalid read");
            finished = this._dsk.read();
            if (finished) {
                this._status &= ~ST_BUSY;
                this._intrq = PRT_INTRQ;
            } else {
                this._status |= ST_DRQ;
                this._data = this._dsk.data;
            }
            if (this._log)
                console.log("FD1793: exec - read done, finished:", finished, "data:", Utils.toHex8(this._data), "status:", Utils.toHex8(this._status));
        } else {
            // finish lingering
            this._status &= ~ST_BUSY;
        }
    };

    FD1793.prototype.read = function(addr) {
        var result = 0;
        if (this._dsk.isReady()) this._status &= ~ST_NOTREADY;
        else this._status |= ST_NOTREADY;
        var returnStatus;
        switch (addr) {
            case 0: // status
                // if ((this._status & ST_BUSY) && this._lingertime > 0) {
                //         if (--this._lingertime === 0) {
                //             this.exec();
                //         }
                // }
                // to make software that waits for the controller to start happy:
                // linger -10 to 0 before setting busy flag, set busy flag
                // linger 0 to 10 before exec
                returnStatus = this._status;
                if (this._status & ST_BUSY) {
                    if (this._lingertime < 0) {
                        returnStatus &= ~ST_BUSY; // pretend that we're slow 
                        ++this._lingertime;
                    } else if (this._lingertime < this.LINGER_AFTER) {
                        ++this._lingertime;
                    } else if (this._lingertime === this.LINGER_AFTER) {
                        ++this._lingertime;
                        this.exec();
                        returnStatus = this._status;
                    }
                }

                //this._status &= (ST_BUSY | ST_NOTREADY);
                this._intrq = 0;
                result = returnStatus;
                break;

            case 1: // track
                result = this._track;
                break;

            case 2: // sector
                result = this._sector;
                break;

            case 3: // data
                if (!(this._status & ST_DRQ)) //throw ("invalid read");
                    console.log("reading too much!");
                result = this._data;
                this._status &= ~ST_DRQ;
                this.exec();
                //console.log("FD1793: read data:",Utils.toHex8(result));
                break;

            case 4:
                if (this._status & ST_BUSY) {
                    this.exec();
                }
                // DRQ,0,0,0,0,0,0,INTRQ
                // faster to use than FDC
                result = this._intrq | ((this._status & ST_DRQ) ? PRT_DRQ : 0);
                break;

            default:
                console.warn("FD1793: invalid port read");
                debugger;

        }
        if (this._log)
            console.log("FD1793: read port:", addr, "result:", Utils.toHex8(result), "status:", Utils.toHex8(this._status));
        return result;
    };

    FD1793.prototype.command = function(val) {
        var cmd = val >>> 4;
        var param = val & 0x0f;
        var update, multiple;
        update = multiple = (param & 1);
        this._intrq = 0;
        this._command = val;
        this._commandtr = 0;
        console.log("FD1793: CMD=", Utils.toHex8(val));
        switch (cmd) {
            case 0x00: // restor, type 1
                if (this._log)
                    console.log("FD1793: CMD restore");
                this._intrq = PRT_INTRQ;
                if (this._dsk.isReady()) {
                    this._track = 0;
                    this._dsk.seek(this._track, 1, this._side);
                } else {
                    this._status |= ST_SEEKERR;
                }
                break;
            case 0x01: // seek
                if (this._log)
                    console.log("FD1793: CMD seek", Utils.toHex8(param));
                this._dsk.seek(this._data, this._sector, this._side);
                this._track = this._data;
                this._intrq = PRT_INTRQ;
                this._status |= ST_BUSY;
                this._lingertime = this.LINGER_BEFORE;
                break;
            case 0x02: // step, u = 0
            case 0x03: // step, u = 1
                if (this._log)
                    console.log("FD1793: CMD step", update);
                this._track += this._stepdir;
                if (this._track < 0) {
                    this._track = 0;
                }
                this._lingertime = this.LINGER_BEFORE;
                this._status |= ST_BUSY;
                break;
            case 0x04: // step in, u = 0
            case 0x05: // step in, u = 1
                if (this._log)
                    console.log("FD1793: CMD step in", update);
                this._stepdir = 1;
                this._track += this._stepdir;
                this._lingertime = this.LINGER_BEFORE;
                this._status |= ST_BUSY;
                //this._dsk.seek(this._track, this._sector, this._side);
                break;
            case 0x06: // step out, u = 0
            case 0x07: // step out, u = 1
                if (this._log)
                    console.log("FD1793: CMD step out", update);
                this._stepdir = -1;
                this._track += this._stepdir;
                if (this._track < 0) {
                    this._track = 0;
                }
                this._lingertime = this.LINGER_BEFORE;
                this._status |= ST_BUSY;
                break;
            case 0x08: // read sector, m = 0
            case 0x09: // read sector, m = 1
                var rsSideCompareFlag = (param & 2) >> 1;
                var rsDelay = (param & 4) >> 2;
                var rsSideSelect = (param & 8) >> 3;
                this._commandtr = CMD_READSEC;
                this._status |= ST_BUSY;
                this._dsk.seek(this._track, this._sector, this._side);
                this._dsk.readSector(this._sector);
                //if (this._log)
                    console.log("FD1793: CMD read sector m:", multiple, "p:", Utils.toHex8(param), "sector:", this._sector, "status:", Utils.toHex8(this._status));
                this._lingertime = this.LINGER_BEFORE;
                break;
            case 0x0A: // write sector, m = 0
            case 0x0B: // write sector, m = 1
                if (this._log)
                    console.log("FD1793: CMD write sector", multiple);
                break;
            case 0x0C: // read address
                this._commandtr = CMD_READADDR;
                this._status |= ST_BUSY;
                this._dsk.readAddress();
                this._lingertime = this.LINGER_BEFORE;
                if (this._log)
                    console.log("FD1793: CMD read address m:", multiple, "p:", Utils.toHex8(param), "sector:", Utils.toHex8(this._status));
                break;
            case 0x0D: // force interrupt
                if (this._log)
                    console.log("FD1793: CMD force interrupt");
                break;
            case 0x0E: // read track
                if (this._log)
                    console.log("FD1793: CMD read track");
                break;
            case 0x0F: // write track
                if (this._log)
                    console.log("FD1793: CMD write track");
                break;
        }
        // if ((this._status & ST_BUSY) !== 0) {
        //     this._lingertime = 10;
        // }
    };

    FD1793.prototype.write = function(addr, val) {
        switch (addr) {
            case 0: // command
                this.command(val);
                break;

            case 1: // track (current track)
                if (this._log)
                    console.log("FD1793: set track:", val);
                this._track = val;
                this._status &= ~ST_DRQ;
                break;

            case 2: // sector (desired sector)
                if (this._log)
                    console.log("FD1793: set sector:", val);
                this._sector = val;
                this._status &= ~ST_DRQ;
                break;

            case 3: // data
                if (this._log)
                    console.log("FD1793: set data:", Utils.toHex8(val));
                this._data = val;
                this._status &= ~ST_DRQ;
                break;

            case 4: // param reg
                this._pr = val;
                // Kishinev v06c 
                // 0 0 1 1 x S A B
                this._dsk = this._disks[val & 3]; 
                this._side = ((~val) >> 2) & 1;   // invert side
                if (this._log)
                    console.log("FD1793: set pr:", Utils.toHex8(val),
                        " disk select: ", val & 3, " side: ", this._side);


                // // SS,MON,DDEN,HLD,DS3,DS2,DS1,DS0
                // if (val & 1) this._dsk = this._disks[0];
                // else if (val & 2) this._dsk = this._disks[1];
                // else if (val & 4) this._dsk = this._disks[2];
                // else if (val & 8) this._dsk = this._disks[3];
                // else this._dsk = this._disks[0];
                // this._side = (this._pr & 0x80) >>> 7;
                break;
            default:
                console.warn("FD1793: invalid port write");
                debugger;
        }
    };

    exports.FD1793 = FD1793;
    return exports;
}