export const SyncNodeCWDashboardJSON = {
    "widgets": [
        {
            "height": 5,
            "width": 6,
            "y": 0,
            "x": 0,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Average",
                "period": 300,
                "stacked": false,
                "yAxis": {
                    "left": {
                        "min": 0
                    }
                },
                "region": "${REGION}",
                "metrics": [
                    [ "AWS/EC2", "CPUUtilization", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "CPU utilization (%)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 5,
            "x": 18,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Average",
                "period": 300,
                "stacked": false,
                "yAxis": {
                    "left": {
                        "min": 0
                    }
                },
                "region": "${REGION}",
                "metrics": [
                    [ "AWS/EC2", "NetworkIn", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Network in (bytes)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 0,
            "x": 18,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Average",
                "period": 300,
                "stacked": false,
                "yAxis": {
                    "left": {
                        "min": 0
                    }
                },
                "region": "${REGION}",
                "metrics": [
                    [ "AWS/EC2", "NetworkOut", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Network out (bytes)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 10,
            "x": 0,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Average",
                "period": 300,
                "metrics": [
                    [ "CWAgent", "mem_used_percent", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Mem Used (%)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 5,
            "x": 0,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Average",
                "period": 300,
                "metrics": [
                    [ "CWAgent", "cpu_usage_iowait", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "CPU Usage IO wait (%)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 0,
            "x": 6,
            "type": "metric",
            "properties": {
                "metrics": [
                    [ { "expression": "m7/PERIOD(m7)", "label": "Read", "id": "e7" } ],
                    [ "CWAgent", "diskio_reads", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ { "expression": "m8/PERIOD(m8)", "label": "Write", "id": "e8" } ],
                    [ "CWAgent", "diskio_writes", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m8", "visible": false, "stat": "Sum", "period": 60 } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Sum",
                "period": 60,
                "title": "nvme1n1 Volume Read/Write (IO/sec)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 5,
            "x": 12,
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "CWAgent", "sui_current_block", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "sparkline": true,
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Maximum",
                "period": 60,
                "title": "Sui Client Block Height"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 10,
            "x": 12,
            "type": "metric",
            "properties": {
                "sparkline": true,
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Maximum",
                "period": 60,
                "metrics": [
                    [ "CWAgent", "sui_blocks_behind", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Sui Client Blocks Behind"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 5,
            "x": 6,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Sum",
                "period": 60,
                "stacked": false,
                "yAxis": {
                    "left": {
                        "min": 0
                    }
                },
                "region": "${REGION}",
                "metrics": [
                    [ { "expression": "IF(m7_2 !=0, (m7_1 / m7_2), 0)", "label": "Read", "id": "e7" } ],
                    [ "CWAgent", "diskio_read_time", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_1", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ "CWAgent", "diskio_reads", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_2", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ { "expression": "IF(m7_4 !=0, (m7_3 / m7_4), 0)", "label": "Write", "id": "e8" } ],
                    [ "CWAgent", "diskio_write_time", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_3", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ "CWAgent", "diskio_writes", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_4", "visible": false, "stat": "Sum", "period": 60 } ]
                ],
                "title": "nvme1n1 Volume Read/Write latency (ms/op)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 10,
            "x": 6,
            "type": "metric",
            "properties": {
                "metrics": [
                    [ { "expression": "(m2/1048576)/PERIOD(m2)", "label": "Read", "id": "e2", "period": 60, "region": "${REGION}" } ],
                    [ "CWAgent", "diskio_read_bytes", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m2", "stat": "Sum", "visible": false, "period": 60 } ],
                    [ { "expression": "(m3/1048576)/PERIOD(m3)", "label": "Write", "id": "e3", "period": 60, "region": "${REGION}" } ],
                    [ "CWAgent", "diskio_write_bytes", "InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m3", "stat": "Sum", "visible": false, "period": 60 } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Average",
                "period": 60,
                "title": "nvme1n1 Volume Read/Write throughput (MiB/sec)"
            }
        },
        {
            "height": 5,
            "width": 6,
            "y": 0,
            "x": 12,
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "CWAgent", "disk_used_percent", "path", "/data", "InstanceId", "${INSTANCE_ID}", "device", "nvme1n1", "fstype", "ext4", { "region": "${REGION}", "label": "/data" } ]
                ],
                "sparkline": true,
                "view": "singleValue",
                "region": "${REGION}",
                "title": "nvme1n1 Disk Used (%)",
                "period": 60,
                "stat": "Average"
            }
        }
    ]
}
