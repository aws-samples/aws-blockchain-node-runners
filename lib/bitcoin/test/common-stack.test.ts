import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/bitcoinConfig";
import { BitcoinCommonStack } from "../lib/common-stack";

describe("BitcoinCommonStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();

        const bitcoinCommonStack = new BitcoinCommonStack(app, "bitcoin-common", {
            stackName: `bitcoin-nodes-common`,
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
        });

        const template = Template.fromStack(bitcoinCommonStack);

        // Has IAM role for EC2 instances
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
            ManagedPolicyArns: Match.arrayWith([
                {
                    "Fn::Join": Match.anyValue()
                }
            ])
        });

        // Has output for instance role ARN
        template.hasOutput("InstanceRoleARN", {
            Export: {
                Name: "BitcoinNodeInstanceRoleArn"
            }
        });
    });
});
