// Vector-06js (c) 2016 Viacheslav Slavinsky
//
// ROM loader
// Load ROM from url: url can be direct rom/r0m, or an url of a zip
// file containing a rom/r0m. First suitable entry will be used.
//
function Loader(url, callback, callback_error) {
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
        writer = new zip.BlobWriter("application/octet-stream");
        entry.getData(writer, function(data) {
            readData(data, callback, start);
        });
    }

    var tryUnzip = function(url, blob, callback) {
        zip.createReader(new zip.BlobReader(blob), function(reader) {
                reader.getEntries(function(entries) {
                    if (entries.length) {
                        for (var i = 0; i < entries.length; i++) {
                            var lower = entries[i].filename.toLowerCase();
                            if (lower.endsWith("rom") ||
                                lower.endsWith("r0m") ||
                                lower.endsWith("com")) {
                                var start = lower.endsWith("r0m") ? 0 : 0x100;
                                console.log("Found ROM: ", entries[i].filename,
                                    "start=", start.toString(16));
                                extract(entries[i], callback, start);
                                break;
                            }
                        }
                    }
                });
            },
            function(error) {
                console.log("unzip", error, " - trying as rom");
                var start = url.toLowerCase().endsWith("r0m") ? 0 : 0x100;
                readData(blob, callback, start);
            });

        return undefined;
    }

    fetchROM2(url, callback, callback_error);
}