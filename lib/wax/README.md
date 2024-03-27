# Sample CDK app for WAX Nodes

| Contributed by |
|:--------------------:|
| [worldwide-asset-exchange](https://github.com/worldwide-asset-exchange/)|

WAX is a blockchain-based system designed for gaming industry. It provides high transaction throughput and near-instant block finality. The WAX team has created a AWS Cloud Development Kit (CDK) applicaiton to deploy WAX nodes on AWS for development, testing, or Proof of Concept purposes. See the application along with deployment instructions at [wax-aws-cdk](https://github.com/worldwide-asset-exchange/wax-aws-cdk). 

## Overview of Deployment Architecture

![Single Nodes Deployment](./doc/assets/Architecture-SingleNode.drawio.png)

The [AWS CDK stack]((https://github.com/worldwide-asset-exchange/wax-aws-cdk)) has the following features:

1. Only peer-to-peer connections are allowed with the Internet to synchronize with other WAX nodes
2. Multiple processes run on a single Amazon Elastic Compute Cloud (Amazon EC2) instance:
   - A [Docker container](https://www.docker.com/resources/what-container/) with the WAX node in one of two possible configurations (API or Ship node)
   - A [Telegraf agent](https://www.influxdata.com/time-series-platform/telegraf/) to collect CPU, disk, I/O, and networking metrics for internal monitoring tools
   - [Victoria Metrics](https://victoriametrics.com/), a time series database for storing the metrics from Telegraf and WAX nodes
   - A [Grafana dashboard](https://grafana.com/) to display key system and blockchain metrics from CPU and disc usage to synced blocks and sync difference
3. By default, all API ports, including the one for the Grafana web user interface, are available only to IP addresses from within the same VPC.
4. The logs of the WAX node are published to Amazon CloudWatch.