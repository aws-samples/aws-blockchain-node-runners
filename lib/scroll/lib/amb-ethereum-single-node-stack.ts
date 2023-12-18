import * as cdk from "aws-cdk-lib";
import * as cdkConstructs from "constructs";
import * as nag from "cdk-nag";
import * as configTypes from "./config/scrollConfig.interface";
import { SingleNodeAMBEtheruemConstruct } from "../../constructs/amb-ethereum-single-node";

export interface ScrollAMBEtheruemSingleNodeStackProps extends cdk.StackProps {
    ambEntereumNodeNetworkId: configTypes.AMBEthereumNodeNetworkId,
    ambEntereumNodeInstanceType: string,
}

export class ScrollAMBEthereumSingleNodeStack extends cdk.Stack {
    constructor(scope: cdkConstructs.Construct, id: string, props: ScrollAMBEtheruemSingleNodeStackProps) {
        super(scope, id, props);

        // Setting up necessary environment variables
        const availabilityZones = cdk.Stack.of(this).availabilityZones;
        const chosenAvailabilityZone = availabilityZones.slice(0, 1)[0];

        // Getting our config from initialization properties
        const {
            ambEntereumNodeNetworkId,
            ambEntereumNodeInstanceType,
        } = props;

        // Setting up L1 Ethereum node with AMB Ethereum node construct

        const ambEthereumNode = new SingleNodeAMBEtheruemConstruct(this, "amb-ethereum-l1-single-node", {
            instanceType: ambEntereumNodeInstanceType,
            availabilityZone: chosenAvailabilityZone,
            ethNetworkId: ambEntereumNodeNetworkId,
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
