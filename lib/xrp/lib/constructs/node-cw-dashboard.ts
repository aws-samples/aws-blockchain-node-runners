export const SingleNodeCWDashboardJSON = {
    "widgets": [
        {
            "height": 6,
            "width": 8,
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
                    [ "AWS/EC2", "CPUUtilization","InstanceId", "${INSTANCE_ID}", {"label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "CPU utilization (%)"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 0,
            "x": 8,
            "type": "metric",
            "properties": {
                "metrics": [
                    [ { "expression": "m7/PERIOD(m7)", "label": "Read", "id": "e7" } ],
                    [ "CWAgent", "diskio_reads","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ { "expression": "m8/PERIOD(m8)", "label": "Write", "id": "e8" } ],
                    [ "CWAgent", "diskio_writes","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m8", "visible": false, "stat": "Sum", "period": 60 } ]
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
            "height": 6,
            "width": 8,
            "y": 0,
            "x": 16,
            "type": "metric",
            "properties": {
                "sparkline": false,
                "view": "singleValue",
                "region": "${REGION}",
                "stacked": false,
                "singleValueFullPrecision": true,
                "liveData": true,
                "setPeriodToTimeRange": false,
                "trend": true,
                "metrics": [
                    [ "CWAgent", "XRP_Sequence","InstanceId", "${INSTANCE_ID}", {"label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "XRP Sequence"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 6,
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
                    [ "AWS/EC2", "NetworkIn","InstanceId", "${INSTANCE_ID}", {"label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Network in (bytes)"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 6,
            "x": 8,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Average",
                "period": 300,
                "metrics": [
                    [ "CWAgent", "cpu_usage_iowait","InstanceId", "${INSTANCE_ID}", {"label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "CPU Usage IO wait (%)"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 6,
            "x": 16,
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
                    [ "CWAgent", "diskio_read_time","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_1", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ "CWAgent", "diskio_reads","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_2", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ { "expression": "IF(m7_4 !=0, (m7_3 / m7_4), 0)", "label": "Write", "id": "e8" } ],
                    [ "CWAgent", "diskio_write_time","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_3", "visible": false, "stat": "Sum", "period": 60 } ],
                    [ "CWAgent", "diskio_writes","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m7_4", "visible": false, "stat": "Sum", "period": 60 } ]
                ],
                "title": "nvme1n1 Volume Read/Write latency (ms/op)"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 12,
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
                    [ "AWS/EC2", "NetworkOut","InstanceId", "${INSTANCE_ID}", {"label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Network out (bytes)"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 12,
            "x": 8,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Average",
                "period": 300,
                "metrics": [
                    [ "CWAgent", "mem_used_percent","InstanceId", "${INSTANCE_ID}", {"label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Mem Used (%)"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 12,
            "x": 16,
            "type": "metric",
            "properties": {
                "metrics": [
                    [ { "expression": "m2/PERIOD(m2)", "label": "Read", "id": "e2", "period": 60, "region": "us-east-1" } ],
                    [ "CWAgent", "diskio_read_bytes","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m2", "stat": "Sum", "visible": false, "period": 60 } ],
                    [ { "expression": "m3/PERIOD(m3)", "label": "Write", "id": "e3", "period": 60, "region": "us-east-1" } ],
                    [ "CWAgent", "diskio_write_bytes","InstanceId", "${INSTANCE_ID}", "name", "nvme1n1", { "id": "m3", "stat": "Sum", "visible": false, "period": 60 } ]
                ],
                "view": "timeSeries",
                "stacked": false,
                "region": "${REGION}",
                "stat": "Average",
                "period": 60,
                "title": "nvme1n1 Volume Read/Write throughput (bytes/sec)"
            }
        },
        {
            "height": 6,
            "width": 8,
            "y": 18,
            "x": 0,
            "type": "metric",
            "properties": {
                "metrics": [
                    [ "CWAgent", "disk_used_percent","InstanceId", "${INSTANCE_ID}", "device", "nvme1n1", "path", "/var/lib/rippled", "fstype", "xfs", { "region": "${REGION}", "label": "/var/lib/rippled" } ]
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
