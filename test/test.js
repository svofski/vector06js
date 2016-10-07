console.log("HELLO");
console.debug = function(x) {
    console.log(x);
};

var Canvas = require('canvas');
var fs = require('fs');
var PNG = require('pngjs').PNG;
var async = require('async');

var toCompare = [];

Canvas.prototype.saveState = function(filename, callback_done) {
        if (!filename) {
            filename = 'state.png';
        }
        var out = fs.createWriteStream(__dirname + '/' + filename);
        var stream = this.pngStream();

        stream.on('data', function(chunk){
            out.write(chunk);//, null, callback_done);
        });
        stream.on('end', function() { 
            out.end();
        });
        out.on('finish', function() {
            if (callback_done) {
                callback_done();
            }
        });
    };

var newCanvas = function() {
    var c = new Canvas(600,384);
    return c;
};

var document = {};
document.screenCanvas = newCanvas();

document.getElementById = function(id) {
    if (id === "canvas") {
        return this.screenCanvas; //newCanvas();//screenCanvas;
    }
};
document.createElement = function(name) {
    if (name === "canvas") {
        return newCanvas();
    }
};

function TestCase(boot, testrom, endframe) {
    var framecount = 0;
    var endFrame = endframe === undefined ? 42 : endframe;

    this.testrom = testrom;

    var that = this;
    this.go = function() {
        console.log('\nTESTCASE START: ' + testrom + '; ' + endFrame + ' FRAMES');
    
        var memory = new Memory();
        var keyboard2 = new Keyboard();
        keyboard2.Hook();
        var timer = new I8253();
        var ay = new AY();
        var fd1793 = Floppy().FD1793;
        var floppy = new fd1793();
        var io = new IO(keyboard2, timer, memory, ay, floppy);
        var cpu = new I8080(memory, io);
        var v06c = new Vector06c(cpu, memory, io, ay);
        v06c.oneFrame = v06c.oneFrameTest;

        v06c.ondisplay = function() {
            if (++framecount == endFrame) {
                var name = 'out/' + testrom + '.png';
                console.log('Saving frame to ' + name);
                v06c.pause(function() {
                    v06c.bufferCanvas.saveState(name,
                        // callback_done
                        function() {
                            console.log('TESTCASE END: ' + testrom);
                            toCompare.push({'test':testrom, 'path':name});
                            if (that.next) {
                                that.next.go();
                            } else {
                                console.log("END OF LINE");
                            }
                        },
                        // callback_compare
                        function() {
                        }
                        );
                });
            }
        };
     
        if (boot) {
            (function() {
                fs.open('../boot/boots.bin', 'r', function(status, fd) {
                    if (status) {
                        console.log(status.message);
                        return;
                    }
                    var buffer = new Buffer(2048);
                    fs.read(fd, buffer, 0, 2048, 0, function(err,num) {
                        console.log("Read " + num + " bytes");
                        memory.attach_boot(buffer);
                        v06c.BlkSbr(true);
                    });
                });
            })();
        } else {
            var test = (function(testname) {
                fs.open('../testroms/' + testname, 'r', function(status, fd) {
                    if (status) {
                        console.log(status.message);
                        return;
                    }
                    var buffer = new Buffer(65536);
                    fs.read(fd, buffer, 0, 2048, 0, function(err,num) {
                        console.log("Read " + num + " bytes from " + testname);
                        memory.init_from_array(buffer.slice(0, num), 256);
                        v06c.BlkSbr(false);
                    });
                });
            })(testrom);
        }
    };
   
    this.then = function(next) {
        console.log(that.testrom + ".then(" + next.testrom + ")");
        that.next = next;
        return next;
    }
}

function chksum(x) {
    var res = 0;
    for (var i = x.length - 1; --i >= 0;) res += x[i];
    return res;
}

function Dummy() {
    this.loadPNG = function(filename, map, kolbask) {
        fs.createReadStream(filename)
            .on('error', function(err) {
                console.log("I/O " + err);
                kolbask();
            })
            .pipe(new PNG())
            .on('parsed', function() {
                map[filename] = this.data;
                kolbask();
            });
    };

    this.go = function() {
        console.log("\nRESULT COMPARISON FOLLOWS");
        var map = {};
        var proc = [];
        for (var i = 0; i < toCompare.length; i++) {
            var test = toCompare[i].test;
            var act = toCompare[i].path;
            var exp = 'expected/' + test + '.png';

            var that = this;
            (function(id,tname,resultpng,expectpng) {
                proc.push(function(cb) {
                    that.loadPNG(resultpng, map, cb);
                });
                proc.push(function(cb) {
                    that.loadPNG(expectpng, map, cb);
                });
                proc.push(function(cb) {
                    var msg = id + ": " + tname;
                    var x = map[resultpng], y = map[expectpng];
                    if (!x || !y) {
                        console.log(msg + ": ERROR: some content could not be read");
                        return cb();
                    }
                    if (x.length != y.length) {
                        console.log(msg + ": ERROR: bitmap data lengths mismatch");
                        return cb();
                    } 
                    for (var i = x.length; --i >= 0;) {
                        if (x[i] != y[i]) {
                            console.log(msg + ": ERROR: content mismatch");
                            return cb();
                        }
                    }
                    console.log(msg + ": OK");
                    cb();
                });
            })(i,test,act,exp);
        }
        async.series(proc);
    };
}

var chain = new TestCase(true, 'boot');
    chain.then( new TestCase(false, 'bord2.rom')).then(
                new TestCase(false, 'testtp.rom', 1800)).then(
                new Dummy());
    chain.go();


