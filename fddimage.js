// vector-06js (c) 2016 Viacheslav Slavinsky
// FDD image builder

// struct HEADER {
// 	unsigned char User;
// 	char Name[8];
// 	char Ext[3];
// 	unsigned char Extent;
// 	unsigned char Unknown1;
// 	unsigned char Unknown2;
// 	unsigned char Records;
// 	WORD FAT[8];
// };
function MDHeader() {
    this.User = 0;
    this.Name = "";
    this.Ext = "";
    this.Extent = 0;
    this.Unknown1 = 0;
    this.Unknown2 = 0;
    this.Records = 0;
    this.FAT = [];
    this.Mapped = null;
    this.Index = 0;
}

MDHeader.prototype.FromArray = function(data) {
    var i = 0;
    this.User = data[i];
    i += 1;
    this.Name = String.fromCharCode.apply(null, data.subarray(i, i + 8));
    i += 8;
    this.Name = this.Name.trim();
    this.Ext = String.fromCharCode.apply(null, data.subarray(i, i + 3));
    i += 3;
    this.Ext = this.Ext.trim();
    this.Extent = data[i];
    i += 1;
    this.Unknown1 = data[i];
    i += 1;
    this.Unknown2 = data[i];
    i += 1;
    this.Records = data[i];
    i += 1;
    var fatbytes = data.subarray(i, i + 16);
    i += 16;
    for (var i = 0; i < fatbytes.length; i += 2) {
        this.FAT.push((0x00ff & fatbytes[i]) | ((fatbytes[i + 1] << 8) & 0xff00));
    }
    this.Mapped = data;
    return this;
}

MDHeader.prototype.ToBytes = function(dst) {
    var i = 0;
    dst[i++] = this.User;
    var name = this.Name + "        ";
    for (var n = 0; n < 8; n += 1) dst[i + n] = name.charCodeAt(n);
    i += 8;
    var ext = this.Ext + "   ";
    for (var n = 0; n < 3; n += 1) dst[i + n] = ext.charCodeAt(n);
    i += 3;
    dst[i++] = this.Extent;
	dst[i++] = this.Unknown1;
	dst[i++] = this.Unknown2;
	dst[i++] = this.Records;
	for (var n = 0; n < 8; n++) {
		dst[i++] = this.FAT[n] & 0xff;
		dst[i++] = (this.FAT[n] >> 8) & 0xff;
	}
};

MDHeader.prototype.FromName = function(filename) {
    [this.Name, this.Ext] = filename.toUpperCase().split(".");
    if (this.Ext == undefined) {
        this.Ext = "";
    }
    return this;
}

function Dirent(fs) {
    this.FS = fs;
    this.Header = null;
    this.Chain = null;
    this.Size = 0;
}

Dirent.prototype.FromHeader = function(header) {
    this.Header = header;
    this.Chain = [];
    var lastHeader =
        (function(fs, sought, chain) {
            var lastHeader;
            var cb = function(h) {
                //console.log("sought name=", sought.Name + "." + sought.Ext);
                if (h.User < 0x10 && h.Name === sought.Name && h.Ext === sought.Ext) {
                    for (var c in h.FAT) {
                        chain.push(h.FAT[c]);
                    }
                    if (h.Records != 0x80) {
                        lastHeader = h;
                        return true;
                    }
                }
            };
            fs.readDir(cb);
            return lastHeader;
        })(this.FS, header, this.Chain);

    if (lastHeader) {
        this.Size = lastHeader.Extent * 2048 * 8 + lastHeader.Records * 128;
    }

    return this;
};

function Filesystem(size) {
    this.bytes = new Uint8Array(size);
    for (var i = this.bytes.length; --i >= 0; this.bytes[i] = 0xe5);
}

Filesystem.prototype.FromArray = function(source) {
    if (this.bytes.length < source.length) {
        this.bytes = new Uint8Array(source.length);
        for (var i = this.bytes.length; --i >= 0; this.bytes[i] = 0xe5);
    }
    for (var i = source.length; --i >= 0;) {
        this.bytes[i] = source[i];
    }
    return this;
};

Filesystem.prototype.mapSector = function(track, head, sector) {
    var offset = track * 1024 * 10 + head * 1024 * 5 + (sector - 1) * 1024;
    return this.bytes.subarray(offset, offset + 1024);
};

Filesystem.prototype.readDir = function(fileCallback) {
    var position = 0xa000;

    for (; position < 0xb000; position += 32) {
        var header = new MDHeader();
        header.FromArray(
            this.bytes.subarray(position, position + 32)
        );
        header.Index = (position - 0xa000) / 32;
        if (fileCallback(header)) {
            break;
        }
    }
};

Filesystem.prototype.findFile = function(filename) {
    var header = new MDHeader();
    header.FromName(filename.toUpperCase());
    var result;
    this.readDir(function(h) {
        if (h.User < 0x10 && h.Name === header.Name && h.Ext === header.Ext) {
            result = h;
            return true;
        }
        return false;
    });
    if (result) {
        return new Dirent(this).FromHeader(result);
    }
    return undefined;
};

Filesystem.prototype.clusterToTHS = function(cluster) {
    var track = 8 + Math.floor(cluster / 5);
    var head = track % 2;
    track >>= 1;
    var sector = 1 + (cluster % 5);
    return [track, head, sector];
};

Filesystem.prototype.readBytes = function(dirent) {
    var result = new Uint8Array(dirent.Size);
    var resultptr = 0;

    for (var c in dirent.Chain) {
        var clust = dirent.Chain[c] << 1;
        if (clust < 2) {
        	break;
        }
        for (var i = 0; i < 2; i++) {
            var track, head, sector;
            [track, head, sector] = this.clusterToTHS(clust + i);
            //console.log("R: translated cluster ", dirent.Chain[c], "/", i, " to THS ", track, head, sector);
            var mapped = this.mapSector(track, head, sector);
            for (var p = 0; p < 1024; p++) {
                result[resultptr++] = mapped[p];
            }
        }
    }
    return result;
};

Filesystem.prototype.readFile = function(name) {
    var dirent = this.findFile(name);
    if (dirent) {
        return this.readBytes(dirent);
    }
    return undefined;
};

Filesystem.prototype.listDir = function() {
	var that = this;
	this.readDir(function(h) {
        if (h.User < 0x10 && h.Extent == 0) {
            var d = new Dirent(that).FromHeader(h);
            console.log(h.Name + " " + h.Ext + " " + d.Size);
        }
        return false;
	});
}

const MAXCLUST = 390;

Filesystem.prototype.buildAvailableChain = function() {
    var used = new Uint8Array(MAXCLUST);
    (function(fs, used) {
        fs.readDir(function(header) {
            if (header.User < 0x10) {
                for (var i in header.FAT) {
                    used[header.FAT[i]] = true;
                }
            }
            return false;
        });
    })(this, used);

    var unused = [];
    for (var i = 2; i < used.length; i++) {
        if (!used[i]) {
            unused.push(i);
        }
    }
    return unused;
}

Filesystem.prototype.saveFile = function(name, bytes) {
    var chain = this.buildAvailableChain();

    if (chain.length < bytes.length / 2048) {
    	console.log("Disk full, remaining clusters:", chain.length);
    	return false;
    }

    var protoheader = new MDHeader().FromName(name);

    var maxChainIdx = (function(fs, proto, chain, remaining) {
        var chainIndex = 0;
        var extent = 0;
        fs.readDir(function(h) {
            if (h.User >= 0x10) { // take this header				
            	console.log("saveFile: using header ", h.Index, h.Name, h.Ext);
                // allocate clusters
                proto.Records = Math.ceil(remaining / 128);
                proto.Extent = extent;
                extent += 1;
                if (proto.Records > 0x80) proto.Records = 0x80;
                for (var i = 0; i < 8; i += 1) {
                    proto.FAT[i] = remaining > 0 ? chain[chainIndex] : 0;
                    if (remaining > 0) {
                    	remaining -= 2048;
						chainIndex++;
                    }
                }
                proto.ToBytes(h.Mapped);
                if (remaining <= 0) {
                    return true; // all mapped
                }
            }
        });
        return chainIndex;
    })(this, protoheader, chain, bytes.length);

    if (maxChainIdx != 0) {
    	var srcptr = 0;
    	for (var eslabon = 0; eslabon < maxChainIdx && srcptr < bytes.length; eslabon += 1) {
	        var clust = chain[eslabon] << 1;
	        for (var i = 0; i < 2; i++) {
	            var track, head, sector;
	            [track, head, sector] = this.clusterToTHS(clust + i);
	            //console.log("W: translated cluster ", chain[eslabon], "/", i, " to THS ", track, head, sector);
	            var mapped = this.mapSector(track, head, sector);
	            for (var p = 0; p < 1024; p++) {
	            	mapped[p] = bytes[srcptr++];
	            }
	        }

    	}
    }
}

function testFilesystem(fs) {
    console.log("List all files:")
    fs.readDir(function(header) {
        if (header.User < 0x10 && header.Extent == 0) {
            console.log("File: ", header.Name, ".", header.Ext, " header=", header,
                " dirent=", new Dirent(fs).FromHeader(header));
        } else {
            //console.log("Extent ", header.Extent, " header=", header);	    	
        }
    });

    console.log("Find pip.com:");
    var d = fs.findFile("pip.com");
    if (d) {
        console.log("Found:", d);
    } else throw 'File was not found';

    var bytes = fs.readBytes(d);
    var expected = [0xc3, 0xce, 0x4, 0xc9, 0x0, 0x0, 0xc9, 0x0, 0x0, 0x1a, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x28, 0x49, 0x4e, 0x50, 0x3a, 0x2f, 0x4f, 0x55, 0x54, 0x3a, 0x53, 0x50, 0x41, 0x43, 0x45, 0x29];
    console.log("Read bytes:", (function(arr) {
        var res = "";
        for (i in arr) {
            res += arr[i].toString(16) + " ";
        }
        return res;
    })(bytes.subarray(0, 32)));

    var match = true;
    for (var i = 0; i < expected.length; i += 1) {
        match &= bytes[i] === expected[i];
        if (!match) {
            console.log("Contents mismatch: expected 0x" + expected[i].toString(16) + " got " + bytes[i].toString(16));
            debugger;
        }
    }
    console.log("File reading seems to be ok");

    console.log("Which clusters are unallocated:")
    var chain = fs.buildAvailableChain();
    console.log(chain);

    console.log("Creating new file");
    var contents = new Uint8Array(54321);
    for (var i = contents.length; --i >= 0; contents[i] = Math.random() * 255);
    fs.saveFile("test.rnd", contents);

    console.log("List all files:")
    fs.readDir(function(header) {
        if (header.User < 0x10 && header.Extent == 0) {
            console.log("File: ", header.Name, ".", header.Ext, " header=", header,
                " dirent=", new Dirent(fs).FromHeader(header));
        } else {
            //console.log("Extent ", header.Extent, " header=", header);	    	
        }
    });

    console.log("Searching for new file:")
    var d = fs.findFile("test.rnd");
    if (!d) {
    	console.log("test.rnd not found");
    	debugger;
    }
    console.log("found, comparing contents");
    var readcontents = fs.readFile("test.rnd");
    if (!readcontents) {
    	console.log("Could not read file");
    	debugger;
    	throw '';
    }
    for (var i = 0; i < contents.length; i++) {
    	if (contents[i] !== readcontents[i]) {
    		console.log("Contents mismatch pos=", i, "expected=", contents[i].toString(16), "got=", readcontents[i].toString(16));
    		debugger;
    		throw '';
    	}
    }

    console.log("Which clusters are unallocated:")
    var chain = fs.buildAvailableChain();
    console.log(chain);


    console.log("All tests done")

    debugger;
}