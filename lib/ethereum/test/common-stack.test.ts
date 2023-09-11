import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/ethConfig";
import { EthCommonStack } from "../lib/common-stack";

describe("EthCommonStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the EthCommonStack.
    const ethCommonStack = new EthCommonStack(app, "eth-common", {
        env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
        stackName: `eth-nodes-common`,
    });

    // Prepare the stack for assertions.
    const template = Template.fromStack(ethCommonStack);

    // Has Snapshot S3 bucket.
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: Match.stringLikeRegexp("eth-snapshots*"),
      AccessControl: "Private",
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
         {
          ServerSideEncryptionByDefault: {
           SSEAlgorithm: "AES256"
          }
         }
        ]
       },
       PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true
       }
    });
    // Has VPC endpoint for S3.
    template.hasResourceProperties("AWS::EC2::VPCEndpoint", {
      ServiceName: {
        "Fn::Join": [
         "",
         [
          "com.amazonaws.",
          {
           "Ref": "AWS::Region"
          },
          ".s3"
         ]
        ]
       },
      VpcEndpointType: "Gateway",
      VpcId: Match.stringLikeRegexp("vpc-*")
    });

    // Has EC2 instance role.
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
         {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
           Service: "ec2.amazonaws.com"
          }
         }
        ]
       },
       ManagedPolicyArns: [
        {
         "Fn::Join": [
          "",
          [
           "arn:",
           {
            Ref: "AWS::Partition"
           },
           ":iam::aws:policy/AmazonSSMManagedInstanceCore"
          ]
         ]
        },
        {
         "Fn::Join": [
          "",
          [
           "arn:",
           {
            "Ref": "AWS::Partition"
           },
           ":iam::aws:policy/CloudWatchAgentServerPolicy"
          ]
         ]
        }
       ]
    })

 });
});