import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as nag from "cdk-nag";
import * as configTypes from "./config/starknetConfig.interface";
import { SingleNodeAMBEthereumConstruct } from "../../constructs/amb-ethereum-single-node";

export interface ScrollAMBEthereumSingleNodeStackProps extends cdk.StackProps {
    ambEthereumNodeNetworkId: configTypes.AMBEthereumNodeNetworkId,
    ambEthereumNodeInstanceType: string,
}

export class StarknetAMBEthereumSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: ScrollAMBEthereumSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const {
            ambEthereumNodeNetworkId,
            ambEthereumNodeInstanceType,
        } = props;

        // Setting up L1 Ethereum node with AMB Ethereum node construct

        const ambEthereumNode = new SingleNodeAMBEthereumConstruct(this, "amb-ethereum-l1-single-node", {
            instanceType: ambEthereumNodeInstanceType,
            availabilityZone: chosenAvailabilityZone,
            ethNetworkId: ambEthereumNodeNetworkId,
        })

        new cdk.CfnOutput(this, "amb-eth-node-id", {
            value: ambEthereumNode.nodeId,
            exportName: "AmbEthereumNodeId"
        });

        new cdk.CfnOutput(this, "amb-eth-node-rpc-url-billing-token", {
            value: ambEthereumNode.wssRpcUrlWithBillingToken,
            exportName: "AmbEthereumNodeRpcUrlWithBillingToken",
        });
        
        // Adding suppressions to the stack
        nag.NagSuppressions.addResourceSuppressions(
            this,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Need to create custom resources to Create and Delete AMB node and accessor and IAM policy to support a generic case for AMB resources",
                },
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Need to create custom resources to Create and Delete AMB node and accessor and IAM to support ti",
                },
            ],
            true
        );
    }
}
