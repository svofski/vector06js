set -x
SRC="src/*.js"
SRC="./i8080-js/i8080.js $SRC"
level=ADVANCED_OPTIMIZATIONS
closure-compiler --language_in=ECMASCRIPT6 --compilation_level $level $SRC --externs externs.js --create_source_map vector06js.map >compiled.js
echo '//# sourceMappingURL=vector06js.map' >>compiled.js
