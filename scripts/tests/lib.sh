#!/usr/bin/env bash
# Tiny assertion helpers shared by the fixture tests in this directory.
# Sourced, not run: `check <description> <command...>` passes when the command succeeds.
PASS=0; FAIL=0
check() {  # check <description> <command...>   (passes when the command succeeds)
    local desc=$1; shift
    if "$@" >/dev/null 2>&1; then PASS=$((PASS+1)); echo "  ok    $desc"
    else FAIL=$((FAIL+1)); echo "  FAIL  $desc"; fi
}
has()    { grep -qF -- "$2" "$1"; }          # has <file> <fixed string>
hasnt()  { ! grep -qF -- "$2" "$1"; }        # hasnt <file> <fixed string>
count()  { [[ "$(grep -cF -- "$2" "$1" || true)" -eq "$3" ]]; }   # count <file> <string> <n>
summary() { echo "passed=$PASS failed=$FAIL"; [[ $FAIL -eq 0 ]]; }
