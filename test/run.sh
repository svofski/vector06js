rm -rf out/
mkdir -p out
cat ../i8080-js/i8080_trace.js ../i8080-js/i8080_disasm.js ../i8080-js/i8080.js ../src/ay.js ../src/fd1793.js ../src/fddimage.js ../src/i8253.js ../src/io.js ../src/keyboard.js  ../src/memory.js ../src/sound.js ../src/tv.js test.js >all.js
node --harmony all.js
