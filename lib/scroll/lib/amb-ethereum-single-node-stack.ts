import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as nag from "cdk-nag";
import * as configTypes from "./config/scrollConfig.interface";
import { SingleNodeAMBEthereumConstruct } from "../../constructs/amb-ethereum-single-node";

export interface ScrollAMBEthereumSingleNodeStackProps extends cdk.StackProps {
    ambEthereumNodeNetworkId: configTypes.AMBEthereumNodeNetworkId,
    ambEthereumNodeInstanceType: string,
}

export class ScrollAMBEthereumSingleNodeStack extends cdk.Stack {
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
            value: ambEthereumNode.rpcUrlWithBillingToken,
            exportName: "AmbEthereumNodeRpcUrlWithBillingToken",
        });
    }
}
