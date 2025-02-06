import { Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import * as config from "../lib/config/XRPConfig";
import { XRPCommonStack } from "../lib/common-stack";

dotenv.config({ path: "./test/.env-test" });

describe("XRPCommonStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();

        // Create the XRPCommonStack.
        const xrpCommonStack = new XRPCommonStack(app, "xrp-common", {
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
            stackName: `xrp-nodes-common`
        });

        // Prepare the stack for assertions.
        const template = Template.fromStack(xrpCommonStack);

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
                                "Ref": "AWS::Partition"
                            },
                            ":iam::aws:policy/SecretsManagerReadWrite"
                        ]
                    ]
                },
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
        });

    });
});