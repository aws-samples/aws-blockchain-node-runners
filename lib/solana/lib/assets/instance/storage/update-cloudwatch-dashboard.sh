#!/usr/bin/env bash

print_usage() {
    echo "Usage: instance/storage/update-cloudwatch-dashboard.sh <DASHBOARD_NAME> ["" | /data/data | /data/accounts]"
    echo "Example: instance/storage/update-cloudwatch-dashboard.sh solana-single-node-extendedrpc-i-0f961f2f2646b4bf4"
}

get_device_for_mount_path() {
    if [ -n "$1" ]; then
        MOUNT_PATH=$1
    else
        echo "Error: No mount path provided."
        echo "Usage: get_device_for_mount_path [/data/accounts | /data/data]"
        exit 1
    fi
    DEVICE=$(mount | grep "${MOUNT_PATH}" | awk '{print $1}')
    echo "${DEVICE#/dev/}"
}

get_device_for_replacement () {
    if [ -n "$1" ]; then
        MOUNT_PATH=$1
    else
        echo "Error: No mount path provided."
        echo "Usage: get_device_for_replacement [/data/accounts | /data/data]"
        exit 1
    fi
    case $MOUNT_PATH in
        "/data/accounts")
            REPLACING_DEVICE="nvme2n1"
            ;;
        "/data/data")
            REPLACING_DEVICE="nvme1n1"
            ;;
        *)
            echo "Error: Invalid mount path provided."
            echo "Usage: get_device_for_replacement [/data/accounts | /data/data]"
            exit 1
            ;;
    esac
    echo "${REPLACING_DEVICE}"
}

if [ -n "$1" ]; then
    DASHBOARD_NAME=$1
else
    echo "Error: No dashboard name provided."
    print_usage
    exit 1
fi

case $2 in
    /data/accounts)
        MOUNT_PATHS=("/data/accounts")
        ;;
    /data/data)
        MOUNT_PATHS=("/data/data")
        ;;
    *)
        MOUNT_PATHS=("/data/accounts" "/data/data")
        ;;
esac

echo "MOUNT_PATHS=${MOUNT_PATHS[*]}"

# Download cloudwatch dashboard using aws cli
if [ ! -f /tmp/dashboard.json ]; then
    aws cloudwatch get-dashboard --dashboard-name "$DASHBOARD_NAME" --output json | jq -r .DashboardBody > /tmp/dashboard.json
fi

for MOUNT_PATH in ${MOUNT_PATHS[*]}; do
    DEVICE=$(get_device_for_mount_path "$MOUNT_PATH")
    FIND_DEVICE=$(get_device_for_replacement "$MOUNT_PATH")
    REPLACING_DEVICE="$DEVICE"
    echo "Found device $DEVICE for mount path $MOUNT_PATH"

    SED_STRING="s/$FIND_DEVICE/$REPLACING_DEVICE/g"

    echo "Replacing $FIND_DEVICE with $REPLACING_DEVICE in /tmp/dashboard.json using $SED_STRING"
    sed -i "$SED_STRING" /tmp/dashboard.json
done

# Upload cloudwatch dashboard using aws cli
aws cloudwatch put-dashboard --dashboard-name "$DASHBOARD_NAME" --dashboard-body file:///tmp/dashboard.json