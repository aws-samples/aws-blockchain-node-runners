#!/bin/bash

cd ../lib || exit 1

run_test(){
    if [ -z "$1" ]; then
        echo "Please provide blueprint directory name"
        exit 1
    fi
    local workdir=$1
    cd "$workdir" || exit 1
    echo "Running tests for $workdir"
    npm run test
    if [ $? -ne 0 ]; then
        echo "Tests failed for $workdir"
        exit 1
    fi
    echo "Tests successful for $workdir"
    cd ../ || exit 1
}

# Run tests for each blueprint
excluded_directories=("besu-private" "constructs" "wax")
for dir in */; do
    # If dir is not in the array of excluded_directories, run test
    if [[ "${excluded_directories[*]}" =~ ${dir%/} ]]; then
        echo "Skipping $dir"
    else
        run_test "$dir"
    fi
done