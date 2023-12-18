import * as cdk from "aws-cdk-lib";
import * as cdkContructs from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cr from 'aws-cdk-lib/custom-resources';
import * as configTypes from "./config.interface";
import * as nag from "cdk-nag";

export interface SingleNodeAMBEthereumConstructCustomProps {
    instanceType: string,
    availabilityZone: string,
    ethNetworkId: configTypes.AMBEthereumNodeNetworkId,
  }

export class SingleNodeAMBEthereumConstruct extends cdkContructs.Construct {
    public nodeId: string;
    public rpcUrl: string;
    public billingToken: string;
    public rpcUrlWithBillingToken: string;


    constructor(scope: cdkContructs.Construct, id: string, props: SingleNodeAMBEthereumConstructCustomProps) {
      super(scope, id);
  
      const REGION = cdk.Stack.of(this).region;
      const {
        instanceType,
        availabilityZone,
        ethNetworkId,
      } = props;
  
      const createNode = new cr.AwsCustomResource(this, 'createNode', {
        onCreate: { // will be called for a CREATE event
          service: 'ManagedBlockchain',
          action: 'createNode',
          parameters: {
            NetworkId: `n-ethereum-${ethNetworkId}`,
            NodeConfiguration: {
              AvailabilityZone: availabilityZone,
              InstanceType: instanceType
            }
          },
          physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()), // Update physical id to always fetch the latest version
        },
        installLatestAwsSdk:true,
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      });
  
      const createAccessor = new cr.AwsCustomResource(this, 'createAccessor', {
        onCreate: { // will be called for a CREATE event
          service: 'ManagedBlockchain',
          action: 'createAccessor',
          parameters: {
            AccessorType: 'BILLING_TOKEN'
          },
          physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString()), // Update physical id to always fetch the latest version
        },
        installLatestAwsSdk:true,
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      });
  
      this.nodeId = createNode.getResponseField('NodeId');
      this.rpcUrl = `https://${this.nodeId}.t.ethereum.managedblockchain.${REGION}.amazonaws.com`;
      this.billingToken=createAccessor.getResponseField('BillingToken');
      this.rpcUrlWithBillingToken = `${this.rpcUrl}?billingtoken=${this.billingToken}`;

      const deleteAccessor = new cr.AwsCustomResource(this, 'deleteAccessor', {
        onDelete: { 
          service: 'ManagedBlockchain',
          action: 'deleteAccessor',
          parameters: {
            AccessorId: createAccessor.getResponseField('AccessorId'),
          },
        },
        installLatestAwsSdk:true,
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      });
  
      const deleteNode = new cr.AwsCustomResource(this, 'deleteNode', {
        onDelete: { 
          service: 'ManagedBlockchain',
          action: 'deleteNode',
          parameters: {
            NetworkId: `n-ethereum-${ethNetworkId}`,
            NodeId: this.nodeId,
          },
        },
        installLatestAwsSdk:true,
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      });
  
    //   nag.NagSuppressions.addResourceSuppressions(
    //     this,
    //     [
    //         {
    //             id: "AwsSolutions-EC29",
    //             reason: "Its Ok to terminate this instance as long as we have the data in the snapshot",
  
    //         },
    //     ],
    //     true
    // );
    }
  }
  