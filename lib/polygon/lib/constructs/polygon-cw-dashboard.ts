export const SingleNodeCWDashboardJSON = {
    "widgets": [
        {
            "height": 5,
            "width": 8,
            "y": 0,
            "x": 0,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Average",
                "period": 300,
                "stacked": false,
                "yAxis": { "left": { "min": 0 } },
                "region": "${REGION}",
                "metrics": [
                    [ "AWS/EC2", "CPUUtilization", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "CPU Utilization (%)"
            }
        },
        {
            "height": 5,
            "width": 8,
            "y": 0,
            "x": 8,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Average",
                "period": 300,
                "stacked": false,
                "region": "${REGION}",
                "metrics": [
                    [ "CWAgent", "mem_used_percent", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Memory Utilization (%)"
            }
        },
        {
            "height": 5,
            "width": 8,
            "y": 0,
            "x": 16,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Average",
                "period": 300,
                "stacked": false,
                "yAxis": { "left": { "min": 0 } },
                "region": "${REGION}",
                "metrics": [
                    [ "AWS/EC2", "NetworkIn", "InstanceId", "${INSTANCE_ID}", { "label": "Network In" } ],
                    [ "AWS/EC2", "NetworkOut", "InstanceId", "${INSTANCE_ID}", { "label": "Network Out" } ]
                ],
                "title": "Network In/Out (bytes)"
            }
        },
        {
            "height": 5,
            "width": 8,
            "y": 5,
            "x": 0,
            "type": "metric",
            "properties": {
                "view": "timeSeries",
                "stat": "Average",
                "period": 300,
                "stacked": false,
                "yAxis": { "left": { "min": 0 } },
                "region": "${REGION}",
                "metrics": [
                    [ "AWS/EC2", "EBSReadOps", "InstanceId", "${INSTANCE_ID}", { "label": "Read Ops" } ],
                    [ "AWS/EC2", "EBSWriteOps", "InstanceId", "${INSTANCE_ID}", { "label": "Write Ops" } ]
                ],
                "title": "Disk Read/Write (ops)"
            }
        },
        {
            "height": 5,
            "width": 8,
            "y": 5,
            "x": 8,
            "type": "metric",
            "properties": {
                "sparkline": true,
                "view": "timeSeries",
                "stat": "Maximum",
                "period": 60,
                "stacked": false,
                "region": "${REGION}",
                "metrics": [
                    [ "Polygon/Node", "ErigonBlockHeight", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Erigon Block Height"
            }
        },
        {
            "height": 5,
            "width": 8,
            "y": 5,
            "x": 16,
            "type": "metric",
            "properties": {
                "sparkline": true,
                "view": "timeSeries",
                "stat": "Maximum",
                "period": 60,
                "stacked": false,
                "region": "${REGION}",
                "metrics": [
                    [ "Polygon/Node", "ErigonSyncing", "InstanceId", "${INSTANCE_ID}", { "label": "${INSTANCE_ID}-${INSTANCE_NAME}" } ]
                ],
                "title": "Erigon Syncing"
            }
        }
    ]
}
