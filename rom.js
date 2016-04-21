// Vector-06js (c) 2016 Viacheslav Slavinsky
//
// ROM loader
// Load ROM from url: url can be direct rom/r0m, or an url of a zip
// file containing a rom/r0m. First suitable entry will be used.
//
function Loader(url, callback, callback_error, callback_fdd, parent_id, container_id) {
    var fetchROM2 = function(url, callback, callback_error) {
        var oReq = new XMLHttpRequest();
        oReq.open("GET", url, true);
        oReq.responseType = "blob";

        oReq.onload = function(oEvent) {
            var blob = oReq.response;
            tryUnzip(url, blob, callback);
        };
        oReq.onerror = function(oEvent) {
            console.log("XMLHttpRequest error", oEvent);
            callback_error();
        }

        oReq.send();
    }

    var readData = function(blob, callback, start) {
        var reader = new FileReader();
        reader.addEventListener("loadend", function() {
            var rawdata = new Uint8Array(reader.result);
            if (typeof start == "function") {
                callback(start(rawdata), 0);
            } else {
                callback(rawdata, start);
            }
        });
        reader.readAsArrayBuffer(blob);
    }

    var extract = function(entry, callback, start) {
        console.log("Unzipping ", entry.filename);
        writer = new zip.BlobWriter("application/octet-stream");
        entry.getData(writer, function(data) {
            readData(data, callback, start);
        });
    }

    var extractAndLaunch = function(entry) {
        var lower = entry.filename.toLowerCase();
        if (lower.endsWith("rom") ||
            lower.endsWith("r0m") ||
            lower.endsWith("bin") ||
            lower.endsWith("com")) {
            var start = lower.endsWith("r0m") || lower.endsWith("bin") ? 0 : 0x100;
            extract(entry, callback, start);
        } else {
            if (lower.endsWith("fdd")) {
                extract(entry, callback_fdd, 
                    function(rawdata) {
                        var fulldisk = rawdata;
                        if (rawdata.length < 819200) {
                            fulldisk = new Uint8Array(819200);
                            for (var i = rawdata.length; --i >= 0; fulldisk[i] = rawdata[i]);
                            for (var i = fulldisk.length; --i >= rawdata.length; fulldisk[i] = 0xe5);
                        }
                        return fulldisk;
                    }
                    );
            }
        }
    };

    var buildFddAndLaunch = function(items) {
        // load the рыба first
        new Loader("roms/ryba.fdd", 
            function(rom, start) {},
            function() {},
            function(image, start) {
                var fs = new Filesystem(0).FromArray(image);
                //callback_fdd(fs.bytes, 0);
                console.log("рыба");
                if (fs) {
                    var asynccount = items.length;
                    var initial = undefined;
                    for (var i = 0; i < items.length; i += 1) {
                        var name = items[i].filename;
                        var finalize = function(initial) {
                            if (initial) {
                                initial = initial.toUpperCase() + "\n\n\n";
                                var ibytes = new Uint8Array(initial.length);
                                for (var i = 0; i < initial.length; i++) {
                                    ibytes[i] = initial.charCodeAt(i);
                                }
                                fs.saveFile("initial.sub", ibytes);
                            }
                            callback_fdd(fs.bytes, 0);
                        };

                        (function(name) {
                            if (name.toLowerCase().endsWith("fdd")) {
                                console.log("Not including ", name);
                                if (--asynccount === 0) {
                                    finalize(initial);
                                    //callback_fdd(fs.bytes, 0);
                                }
                                return;
                            }                             
                            console.log("Extracting ", name);
                            if (name.toLowerCase().endsWith("com")) {
                                initial = name.toUpperCase().split(".")[0];
                            }
                            extract(items[i], function(contents, start) {
                                console.log("Saving ", name);
                                fs.saveFile(name, contents);
                                if (--asynccount === 0) {
                                    console.log("All files saved, boot");
                                    fs.listDir();
                                    //callback_fdd(fs.bytes, 0);
                                    finalize(initial);
                                }
                            }, 0);           
                        })(items[i].filename);
                    }
                    //callback_fdd(fs, 0);
                }
                //debugger;
            });
    }

    var isRom = function(name) {
        var lower = name.toLowerCase();
        return lower.endsWith("rom") || lower.endsWith("r0m") || lower.endsWith("com") ||
            lower.endsWith("bin");
    };
    var isFdd = function(name) {
        var lower = name.toLowerCase();
        return lower.endsWith("fdd");
    };

    var createChooser = function(items) {
        var parent = document.getElementById(parent_id);
        var container = document.getElementById(container_id);

        var build = document.createElement("div");
        build.id = "buildhdr"
        container.appendChild(build);
        build.innerText = "[OR BUILD A BOOTABLE FLOPPY IMAGE]";
        (function(itemz) {
            build.onclick = function() {
                parent.style.display = "none";
                buildFddAndLaunch(itemz);
            };
        })(items);

        var ol = document.createElement("ul");
        ol.className = "romchooser-ol";
        container.appendChild(ol);
        //container.style.height = (parent.parentNode.clientHeight - parent.parentNode.clientHeight * 0.3) + "px";
        container.style.height = "75vh";


        for (var i = 0; i < items.length; i += 1) {
            var li = document.createElement("li");
            var a = document.createElement("a");
            a.href = "#";
            li.appendChild(a);
            a.innerText = items[i].filename;
            (function(clickitem) {
                li.onclick = function() {
                    parent.style.display = "none"
                    extractAndLaunch(clickitem);
                }
            })(items[i]);
            if (isRom(items[i].filename)) {
                li.className = "chooser-li-rom";
            } else if (isFdd(items[i].filename)) {
                li.className = "chooser-li-fdd";
            } else {
                li.className = "chooser-li-wtf";
            }


            ol.appendChild(li);

        }

        parent.style.display = "block";
        Loader.prototype.ChooserElement = parent;
    };

    var tryUnzip = function(url, blob, callback) {
        zip.createReader(new zip.BlobReader(blob), function(reader) {
                reader.getEntries(function(entries) {
                    if (entries.length) {
                        var validlist = [];
                        for (var i = 0; i < entries.length; i++) {
                            var lower = entries[i].filename.toLowerCase();
                            // if (lower.endsWith("rom") ||
                            //     lower.endsWith("r0m") ||
                            //     lower.endsWith("com") ||
                            //     lower.endsWith("bin") ||
                            //     lower.endsWith("fdd")) {
                            //     validlist.push(entries[i]);
                            // }
                            validlist.push(entries[i]);
                        }
                        if (validlist.length == 1) {
                            extractAndLaunch(validlist[0]);
                        } else if (validlist.length > 1) {
                            createChooser(entries);
                        }
                    }
                });
            },
            function(error) {
                console.log("unzip", error, " - trying as rom or fdd");
                if (url.toLowerCase().endsWith("fdd")) {
                    readData(blob, callback_fdd, 0);
                } else {
                    var start = url.toLowerCase().endsWith("r0m") ? 0 : 0x100;
                    readData(blob, callback, start);
                }
            });

        return undefined;
    }

    var initDrop = function(fileselect) {
        if (fileselect) {
            var fileSelectHandler = function(e) {
                console.log("fileSelectHandler e=", fileselect.files[0]);
                if (Loader.prototype.ChooserElement) {
                    Loader.prototype.ChooserElement.style.display = "none";
                    Loader.prototype.ChooserElement = undefined;
                }
                tryUnzip(fileselect.files[0].name, fileselect.files[0], callback);
            }

            fileselect.addEventListener("change", fileSelectHandler, false);
        }
    }

    this.attachDrop = function(fileselect) {
        if (window.File && window.FileList && window.FileReader) {
            initDrop(fileselect);
        }
    }


    fetchROM2(url, callback, callback_error);
}