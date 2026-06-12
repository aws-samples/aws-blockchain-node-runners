import { Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';
dotenv.config({ path: './test/.env-test' });
import * as config from "../lib/config/tronConfig";
import { TronSnapshotNodeStack } from "../lib/snapshot-node-stack";

describe("TronSnapshotNodeStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const tronSnapshotNodeStack = new TronSnapshotNodeStack(app, "tron-snapshot-node", {
      stackName: `tron-snapshot-node`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },
      ...config.baseNodeConfig
    });

    const template = Template.fromStack(tronSnapshotNodeStack);

    // Has an EC2 instance for the snapshot node
    template.hasResourceProperties("AWS::EC2::Instance", {
      InstanceType: "m7g.4xlarge",
      Monitoring: true,
    });

    // Has the data volume
    template.hasResourceProperties("AWS::EC2::Volume", {
      Encrypted: true,
      Size: 4000,
      VolumeType: "gp3"
    });

    // Has a CloudWatch dashboard
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardBody: Match.anyValue(),
    });
  });
});
