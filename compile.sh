set -x
SRC="src/*.js"
SRC="./i8080-js/i8080.js $SRC"
level=ADVANCED_OPTIMIZATIONS
#evil=--use_types_for_optimization false
evil=
closure-compiler --language_in=ECMASCRIPT6 --compilation_level $level $evil $SRC --externs externs.js --create_source_map vector06js.map >compiled.js
echo '//# sourceMappingURL=vector06js.map' >>compiled.js
