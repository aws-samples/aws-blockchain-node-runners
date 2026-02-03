import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/bitcoinConfig";
import { BitcoinHANodesStack } from "../lib/ha-nodes-stack";

describe("BitcoinHANodesStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();

        const bitcoinHANodesStack = new BitcoinHANodesStack(app, "bitcoin-ha-nodes", {
            stackName: `bitcoin-ha-nodes-${config.baseConfig.network}`,
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
            instanceType: config.singleNodeConfig.instanceType,
            instanceCpuType: config.singleNodeConfig.instanceCpuType,
            bitcoinNetwork: config.singleNodeConfig.bitcoinNetwork,
            bitcoinVersion: config.singleNodeConfig.bitcoinVersion,
            nodeConfig: config.singleNodeConfig.nodeConfig,
            snapshotConfig: config.singleNodeConfig.snapshotConfig,
            dataVolume: config.singleNodeConfig.dataVolumes[0],
            albHealthCheckGracePeriodMin: config.haNodeConfig.albHealthCheckGracePeriodMin,
            heartBeatDelayMin: config.haNodeConfig.heartBeatDelayMin,
            numberOfNodes: config.haNodeConfig.numberOfNodes,
        });

        const template = Template.fromStack(bitcoinHANodesStack);

        // Has EC2 instance security group
        template.hasResourceProperties("AWS::EC2::SecurityGroup", {
            GroupDescription: Match.anyValue(),
            VpcId: Match.anyValue(),
        });

        // Has Auto Scaling Group
        template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
            DesiredCapacity: "2",
        });

        // Has Application Load Balancer
        template.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
            Type: "application",
            Scheme: "internal",
        });

        // Has ALB Target Group
        template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
            Port: 8332,
            Protocol: "HTTP",
            TargetType: "instance",
        });

        // Has output for ALB URL
        template.hasOutput("alburl", {
            Value: Match.anyValue(),
        });
    });
});
