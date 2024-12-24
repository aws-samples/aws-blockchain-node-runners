import {Match, Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';

dotenv.config({path: './test/.env-test'});
import * as config from "../lib/config/baseConfig";
import {BaseCommonStack} from "../lib/common-stack";

describe("BaseCommonStack", () => {
  let app: cdk.App;
  let baseCommonStack: BaseCommonStack;
  let template: Template;
  beforeAll(() => {
    app = new cdk.App();

    // Create the BaseCommonStack.
    baseCommonStack = new BaseCommonStack(app, "base-single-node", {
      stackName: `base-nodes-common`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
    });

    template = Template.fromStack(baseCommonStack);
  });

  test("Check Node Instance Role", () => {
    // Has EC2 instance security group.
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
       ],
       Version: "2012-10-17"
      },
      ManagedPolicyArns: [
       {
        "Fn::Join": [
         "",
         [
          "arn:",
          {
           "Ref": "AWS::Partition"
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
     });
    });

    test("Check Node Instance Role Policy", () => {
      // Has EC2 instance security group.
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: [
            {
              Action: "cloudformation:SignalResource",
              Effect: "Allow",
              Resource: "*"
            },
            {
              Action: "autoscaling:CompleteLifecycleAction",
              Effect: "Allow",
              Resource: "arn:aws:autoscaling:us-east-1:xxxxxxxxxxxx:autoScalingGroup:*:autoScalingGroupName/base-*"
            },
            {
              Action: "s3:*Object",
              Effect: "Allow",
              Resource: [
                "arn:aws:s3:::base-snapshots-*-archive",
                "arn:aws:s3:::base-snapshots-*-archive/*"
              ]
            }
          ],
          "Version": "2012-10-17"
        }
      });
    });

});
