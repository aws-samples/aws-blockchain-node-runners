import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env-test" });
import * as config from "../lib/config/node-config";
import { VetCommonStack } from "../lib/common-stack";

describe("VetCommonStack", () => {
    test("synthesizes the way we expect", () => {
        const app = new cdk.App();

        // Create the VetCommonStack.
        const vetCommonStack = new VetCommonStack(app, "vet-common", {
            env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
            stackName: `vet-nodes-common`
        });

        // Prepare the stack for assertions.
        const template = Template.fromStack(vetCommonStack);

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
        });

    });
});
