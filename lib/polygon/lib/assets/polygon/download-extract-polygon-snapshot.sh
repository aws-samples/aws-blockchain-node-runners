#!/bin/bash

# method to extract all files and delete already-extracted download data to minimize disk use
function extract_files() {
    EXTRACT_DIR="$1"
    COMPILED_FILES=$2

    cd "$EXTRACT_DIR"

    while read -r line; do
        if [[ "$line" == checksum* ]]; then
          continue
        fi
        filename=`echo $line | awk -F/ '{print $NF}'`
        if echo "$filename" | grep -q "bulk"; then
          pv $filename | tar -I zstd -xf - -C . && rm $filename
        else
          pv $filename | tar -I zstd -xf - -C . --strip-components=3 && rm $filename
        fi
    done < "$COMPILED_FILES"
}

function download_files() {
    NETWORK="$1"
    CLIENT="$2"

    # download compiled incremental snapshot files list
    aria2c -x10 -s10 "https://snapshot-download.polygon.technology/$CLIENT-$NETWORK-incremental-compiled-files.txt" --max-concurrent-downloads=10

    # remove hash lines if user declines checksum verification
    if [ "$checksum" == "false" ]; then
        sed -i '/checksum/d' $CLIENT-$NETWORK-incremental-compiled-files.txt
    fi

    # download all incremental files, includes automatic checksum verification per increment
    aria2c -x10 -s10 -c --auto-file-renaming=false --max-tries=100 -i $CLIENT-$NETWORK-incremental-compiled-files.txt --max-concurrent-downloads=10

    # Don't extract if download failed
    if [ $? -ne 0 ]; then
        echo "Download failed. Restart the script to resume downloading."
        exit 1
    fi
}

# Check if all three parameters are provided
if [ "$#" -ne 4 ]; then
    echo "Usage: bash [NETWORK] [CLIENT] [EXTRACT_DIR] [SNAPSHOT_S3_PATH]"
    exit 1
fi

# Assign parameters to variables
NETWORK="$1"
CLIENT="$2"
EXTRACT_DIR="$3"
SNAPSHOT_S3_PATH=$4

# Use the variables in the rest of the script
echo "NETWORK: $NETWORK"
echo "CLIENT: $CLIENT"
echo "Extract Directory: $EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
cd "$EXTRACT_DIR"

echo "1.start download : $(date "+%Y-%m-%d %H:%M:%S")"
download_files  $NETWORK $CLIENT
echo "2.end download : $(date "+%Y-%m-%d %H:%M:%S")"

echo "3.start extract : $(date "+%Y-%m-%d %H:%M:%S")"
# execute final data extraction step
extract_files $EXTRACT_DIR $CLIENT-$NETWORK-incremental-compiled-files.txt
echo "4.end extract :$(date "+%Y-%m-%d %H:%M:%S")"

echo "5.upload to s3 : $(date "+%Y-%m-%d %H:%M:%S")"
s5cmd --log error cp $EXTRACT_DIR s3://$SNAPSHOT_S3_PATH$EXTRACT_DIR
echo "5.end upload to s3 : $(date "+%Y-%m-%d %H:%M:%S")"
