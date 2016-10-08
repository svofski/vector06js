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
        out.write(chunk);
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

function TestCase(boot, testrom, endframe, kolbax) {
    var framecount = 0;
    var endFrame = kolbax ? -1 : endframe === undefined ? 42 : endframe;

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
        io.Palette = [4286578688, 4286578688, 4278231200, 4278231200, 
                      4286578688, 4286578688, 4278231200, 4278231200, 
                      4286578688, 4286578688, 4278231200, 4278231200, 
                      4286578688, 4286578688, 4278231200, 4278231200];
        var cpu = new I8080(memory, io);
        var v06c = new Vector06c(cpu, memory, io, ay);
        v06c.oneFrame = v06c.oneFrameTest;

        v06c.ondisplay = function() {
            ++framecount;
            var save = kolbax ? kolbax(v06c, framecount) :
                {'name': testrom,
                 'save': framecount === endFrame,
                 'end' : framecount === endFrame};
            if (save.save) {
                var filename = 'out/' + save.name + '.png';
                console.log('Saving frame ' + framecount + ' to ' + filename);
                v06c.pause(function() {
                    v06c.bufferCanvas.saveState(filename,
                        // callback_done
                        function() {
                            toCompare.push({'test':save.name, 'path':filename});
                            if (save.end) {
                                console.log('TESTCASE END: ' + testrom);
                                if (that.next) {
                                    that.next.go();
                                } else {
                                    console.log("END OF LINE");
                                }
                            } else {
                                setTimeout(function(){v06c.resume();}, 0);
                            }
                        });
                });
            }
        };
     
        (function(testname) {
            romfile = boot ? '../boot/boots.bin' : '../testroms/' + testname;
            fs.open(romfile, 'r', function(status, fd) {
                if (status) {
                    console.log(status.message);
                    return;
                }
                var buffer = new Buffer(65536);
                fs.read(fd, buffer, 0, 65536, 0, function(err,num) {
                    console.log("Read " + num + " bytes");
                    boot ? memory.attach_boot(buffer.slice(0, num)) :
                           memory.init_from_array(buffer.slice(0, num), 256);
                    v06c.BlkSbr(boot);
                });
            });
        })(testrom);
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
chain.then( 
    new TestCase(false, 'bord2.rom')).then(
//    new TestCase(false, 'cpuspeed.rom', 60)).then(
//    new TestCase(false, 'cpu_spd.rom', 60)).then(
    new TestCase(false, 'i8253.rom', 60)).then(
    new TestCase(false, 'i82531.rom', 60)).then(
    new TestCase(false, 'i82532.rom', 60)).then(
    new TestCase(false, 'tst8253.rom', 60)).then(
//    new TestCase(false, 'testtp.rom', 1600)).then(
//    new TestCase(false, 'vst.rom', 1800)).then(
    new TestCase(false, 'scrltst2.rom', 0,
        function(v, frame) {
            var res = {'name': 'scrltst2_' + frame,
                       'save': //frame >= 40,
                               frame === 40 ||
                               frame === 98 ||
                               frame === 101 ||
                               frame === 110 ||
                               frame === 113,
                       'end' : frame === 113};
            var kbd = v.IO.keyboard;
            if (frame == 40)
                kbd.applyKey(17, false);
            return res;
        }
    )).then(
    new Dummy());
chain.go();


