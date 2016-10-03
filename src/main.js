    fullscreen = function(noWarningForNotSupported) {
        var isFullScreen = document.mozFullScreen || document.webkitIsFullScreen;
        if (!isFullScreen) {
            var elem = document.getElementById("canvasdiv");
            var canvasElem = document.getElementById("canvas");

            if (elem.requestFullScreen) {
                elem.requestFullScreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.webkitRequestFullScreen) {
                elem.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
            } else {
                if (!(noWarningForNotSupported == true)) alert("Fullscreen not supported. Try Firefox or Chrome.");
            }
        } else {
            if (document.cancelFullScreen) {
                document.cancelFullScreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            }
        }
    }
    /** @constructor */
    function FullScreener() {
        this.exec = function() {
            fullscreen();
        }
    }

    fullscreener = new FullScreener();
    
    zip.workerScriptsPath = './zip.js/WebContent/';
    memory = new Memory();
    keyboard2 = new Keyboard();
    keyboard2.Hook();
    timer = new I8253();
    ay = new AY();
    var fd1793 = Floppy().FD1793;
    floppy = new fd1793();
    //floppy._log = true;
    io = new IO(keyboard2, timer, memory, ay, floppy);
    cpu = new I8080(memory, io);
    v06c = new Vector06c(cpu, memory, io, ay);
    v06c.frameSkip = 0;

    var frameskip = document.getElementById("frameskip");
    v06c.onframeskip = function(skip, miss) {
        frameskip.innerText = v06c.frameSkip + " " + miss;
    };


    var url = "http://asdasd.rpg.fi/scalar//media/w/test.zip";

    var chooserParent = "chooser-glass";
    var aboutParent = "about-panel";

    if (location.search) {
        url = location.search.substring(1);
        if (url[0] === "i") {
            document.body.className += " fullpage";
            var canvasdiv = document.getElementById("canvasdiv");
            canvasdiv.className = "fullpage";
            var outer = document.getElementById("outerdiv");
            outer.parentNode.replaceChild(canvasdiv, outer);

            // reparent chooser too
            var chooserdiv = document.getElementById("chooser-panelcontainer");
            chooserdiv.style.position = "absolute";
            chooserdiv.style.top = "0";
            chooserdiv.style.left = "0";
            chooserdiv.className += " fullpage";
            canvasdiv.parentNode.appendChild(chooserdiv);
            chooserParent = "chooser-panelcontainer";
            chooserdiv.style.display = "none";

            // reparent about dialog
            var aboutPanel = document.getElementById("about-panel");
            aboutPanel.className += " fullpage";
            canvasdiv.parentNode.appendChild(aboutPanel);
            //aboutPanel.style.display = "none";
            aboutParent = "about-panel"

            url = url.substring(2);
        } else if (url[0] == "t") {
            url = url.substring(2);
            new Loader(url, 
                function(rom, start) { // callback
                    console.log("Loader test - callback ok");
                },
                function() {           // callback_error
                    console.log("Loader test - callback error");
                },
                function(image, start) {
                    var fs = new Filesystem().FromArray(image);
                    testFilesystem(fs);
                });
            // end of test
            v06c.pause(function() {});
            throw 'test ended';
        }
        console.log("user url=", url);
    }
    boot = undefined;

    _onfocus = function() {
        v06c.soundnik.mute(false);
        v06c.resume();
    };
    _onblur = function() {
        v06c.soundnik.mute(true);
        v06c.pause(function() {
        });
    };
    window.addEventListener('load', function() {
        window.addEventListener('focus', _onfocus);
        window.addEventListener('blur', _onblur);
    });

    keyboard2.onreset = function(attach_rom) {
        if (attach_rom && boot) {
            memory.attach_boot(boot);
        }
        v06c.BlkSbr(attach_rom);
    };

    io.onruslat = function(on) {
        if (window.parent['ruslat']) {
            window.parent['ruslat'](on);
        }
    }

    var fileselect = document.getElementById("fileselect");
    var sideloaded = null;

    var loadUserRom = function() {
        console.log("loadUserRom url=", url);

        new Loader(url,
            // callback
            function(rom, start) {
                v06c.pause(function() {
                    memory.init_from_array(rom, start);
                    v06c.BlkSbr(false);
                });
            },
            // callback_error
            function() {
                console.log("ROM could not be loaded from: ", url);

            },
            function(image, start) {
                console.log("Smells like a floppy image: ", url);
                floppy.loadDsk(0, url, image);
                //v06c.BlkSbr(true);
            },
            chooserParent, "chooserpanel"
        ).attachDrop(["fileselect", "canvas"]);
    };

    var sideloadOrLoad = function() {
        if (sideloaded) {
            url = sideloaded;
            loadUserRom();
        } 
        else {
            loadUserRom();
        }
    };

    new Loader("boot/boots.bin",
        // callback
        function(bootrom, start) {
            boot = bootrom;
            v06c.pause(function() {
                memory.init_from_array([], 0);
                memory.attach_boot(bootrom);
                v06c.BlkSbr(true);
                //loadUserRom();
                sideloadOrLoad();
            });
        },
        // callback_error
        function() {
            console.log("Cannot load bootloader, not a problem for loading roms");
        }
    );
    

    about = function(visible) {        
        aboot = document.getElementById(aboutParent);
        if (visible) {
            aboot.className += " visible";
            aboot.style.opacity = 1.0;
        } else {
            aboot.className = aboot.className.substring(0, aboot.className.length - " visible".length);
            aboot.style.opacity = 0.0;
        }
    };
    blksbr = function(reboot) {
        keyboard2.onreset(reboot);
    };
    sideload = function(mem) {
        sideloaded = mem;
        // v06c.pause(function() {
        //     memory.init_from_array(mem, 0);
        //     v06c.BlkSbr(false);
        // });
    };
    if (window.parent['registerHooks']) {
        window.parent['registerHooks']({'about': about, 
                                     'blksbr': blksbr,
                                     'sideload': sideload});
    }
