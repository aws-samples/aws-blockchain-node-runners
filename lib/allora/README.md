# Sample AWS Blockchain Node Runner app for Allora Worker Nodes

| Contributed by |
|:--------------------:|
| [@vladupshot](https://github.com/vladupshot), [@allora-rc](https://github.com/allora-rc) |

[Allora](https://www.allora.network/) is a self-improving decentralized Artificial Intelligence (AI) network. The primary goal of the network is to be the marketplace for intelligence. In other words, Allora aims to incentivize data scientists (workers) to provide high-quality inferences as requested by consumers. Inferences include predictions of arbitrary future events or difficult computations requiring specialized knowledge.

The Allora Network brings together

  - [Consumers](https://docs.allora.network/devs) who pay for and acquire inferences or expertise to be revealed
  - [Workers](https://v2.docs.allora.network/datasci) who reveal inferences
  - [Reputers](https://docs.allora.network/nops) who determine how accurate workers are after a ground truth is revealed
  - [Validators](https://docs.allora.network/nops) who secure protocol state, history, and reward distributions

With these ingredients, the Allora Network is able to continuously learn and improve itself over time producing inferences that are more accurate than the most accurate participant.

Allora Worker nodes are the interfaces between data scientists' models and the Allora Network. A worker node is a machine-intelligent application registered on the Allora chain that provides inference/prediction on a particular topic it's subscribed to and gets rewarded based on the inference quality.

This blueprint is designed to assist in deploying a single Allora [Worker Node](https://v2.docs.allora.network/datasci) on AWS. It is intended for use in development, testing, or Proof of Concept (PoC) purposes.

## Overview of Deployment Architecture

### Single Worker Node Setup
![Single Worker Node Deployment](./doc/assets/Architecture-Single-Allora-Worker-Node.png)

1. The Allora worker node is deployed in the Default VPC. An  Internet Gateway.
2. The Woeker is used by dApps or development tools internally from within the Default VPC. JSON RPC API is not exposed to the Internet directly to protect nodes from unauthorized access.
3. The Allora Worker Node uses all required secrets locally. Optionally, AWS Secrets Manager as secure backup.
The Stacks node sends various monitoring metrics for both EC2 and Stacks nodes to Amazon CloudWatch.

This blueprint creates a setup where the Allora worker node is supported by a side node providing inferences. They communicate through an endpoint so the worker will request inferences to the side node (the Inference Server). This makes an ultra-light worker node.

## Worke Node System Requirements

- Operating System: Any modern Linux operating system
- CPU: Minimum of 1/2 core
- Memory: 2 to 4 GB
- Storage: SSD or NVMe with at least 5GB of space.

## Additional materials

<details>

<summary>Well-Architected Checklist</summary>


This is the Well-Architected checklist for Allora Worker Nodes implementation of the AWS Blockchain Node Runner app. This checklist takes into account questions from the [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) which are relevant to this workload. Please feel free to add more checks from the framework if required for your workload.

| Pillar                  | Control                           | Question/Check                                                                   | Remarks          |
|:------------------------|:----------------------------------|:---------------------------------------------------------------------------------|:-----------------|
| Security                | Network protection                | Are there unnecessary open ports in security groups?                             |    |
|                         |                                   | Traffic inspection                                                               | AWS WAF could be implemented for traffic inspection. Additional charges will apply.  |
|                         | Compute protection                | Reduce attack surface                                                            | This solution uses Canonical, Ubuntu, 24.04 LTS. You may choose to run hardening scripts on it.  |
|                         |                                   | Enable people to perform actions at a distance                                   | This solution uses AWS Systems Manager for terminal session, not ssh ports.  |
|                         | Data protection at rest           | Use encrypted Amazon Elastic Block Store (Amazon EBS) volumes                    | This solution uses encrypted Amazon EBS volumes.  |
|                         | Data protection in transit        | Use TLS                                                                          |  |
|                         | Authorization and access control  | Use instance profile with Amazon Elastic Compute Cloud (Amazon EC2) instances    | This solution uses AWS Identity and Access Management (AWS IAM) role instead of IAM user.  |
|                         |                                   | Following principle of least privilege access                                    | In the node, root user is not used (using special user "ubuntu" instead).  |
|                         | Application security              | Security focused development practices                                           | cdk-nag is being used with documented suppressions.  |
| Cost optimization       | Service selection                 | Use cost effective resources                                                     |  |
|                         | Cost awareness                    | Estimate costs                                                                   |  |
| Reliability             | Resiliency implementation         | Withstand component failures                                                     | This solution currently does not have high availability and is deployed to a single availability zone.  |
|                         | Data backup                       | How is data backed up?                                                           | The data is not specially backed up. The node will have to re-sync its state from other nodes in the Allora network to recover.  |
|                         | Resource monitoring               | How are workload resources monitored?                                            |   |
| Performance efficiency  | Compute selection                 | How is compute solution selected?                                                |   |
|                         | Storage selection                 | How is storage solution selected?                                                |   |
|                         | Architecture selection            | How is the best performance architecture selected?                               |   |
| Operational excellence  | Workload health                   | How is health of workload determined?                                            |   |
| Sustainability          | Hardware & services               | Select most efficient hardware for your workload                                 |   |
</details>
<details>

<summary>Recommended Infrastructure</summary>


| Usage pattern                                     | Ideal configuration                                                                                                      | Primary option on AWS                                                  | Config reference                                      |
|---------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|-------------------------------------------------------|
| 1/ Fullnode                                       | 8 vCPU, 32 GB RAM, Data volume: EBS gp3 2TB, 7K IOPS, 400 MB/s throughput | `m6a.2xlarge` EBS gp3 volumes about 2000 GB(7000 IOPS, 400 MBps/s throughput) | [.env-sample-full](./sample-configs/.env-sample-full) |
</details>

