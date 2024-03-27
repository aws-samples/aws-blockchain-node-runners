import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/bscConfig";
import { BscCommonStack } from "../lib/common-stack";

describe("BSCCommonStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    // Create the BscCommonStack.
    const bscCommonStack = new BscCommonStack(app, "bsc-common", {
        env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
        stackName: `bsc-nodes-common`,
    });

    // Prepare the stack for assertions.
    const template = Template.fromStack(bscCommonStack);

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
