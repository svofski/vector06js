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
            callback(new Uint8Array(reader.result), start);
        });
        reader.readAsArrayBuffer(blob);
    }

    var extract = function(entry, callback, start) {
        console.log("Launching ", entry.filename);
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
                extract(entry, callback_fdd, 0);
            }
        }
    };

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

        var ol = document.createElement("ul");
        ol.className = "romchooser-ol";
        container.appendChild(ol);
        container.style.height = (parent.parentNode.clientHeight - parent.parentNode.clientHeight * 0.3) + "px";
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

        parent.style.display = "table";
    };

    var tryUnzip = function(url, blob, callback) {
        zip.createReader(new zip.BlobReader(blob), function(reader) {
                reader.getEntries(function(entries) {
                    if (entries.length) {
                        var validlist = [];
                        for (var i = 0; i < entries.length; i++) {
                            var lower = entries[i].filename.toLowerCase();
                            if (lower.endsWith("rom") ||
                                lower.endsWith("r0m") ||
                                lower.endsWith("com") ||
                                lower.endsWith("bin") ||
                                lower.endsWith("fdd")) {} {
                                validlist.push(entries[i]);
                            }
                        }
                        if (validlist.length == 1) {
                            extractAndLaunch(validlist[0]);
                        } else {
                            createChooser(validlist);
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
        var fileSelectHandler = function(e) {
            console.log("fileSelectHandler e=", fileselect.files[0]);
            tryUnzip(fileselect.files[0].name, fileselect.files[0], callback);
        }

        fileselect.addEventListener("change", fileSelectHandler, false);
    }

    this.attachDrop = function(fileselect) {
        if (window.File && window.FileList && window.FileReader) {
            initDrop(fileselect);
        }
    }


    fetchROM2(url, callback, callback_error);
}