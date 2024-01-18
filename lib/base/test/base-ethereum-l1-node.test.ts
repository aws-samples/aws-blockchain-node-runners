import {Match, Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';

dotenv.config({path: './test/.env-test'});
import * as config from "../lib/config/baseConfig";
import {BaseAMBEthereumSingleNodeStack} from "../lib/amb-ethereum-single-node-stack";

describe("BaseAMBEthereumSingleNodeStack", () => {
  let app: cdk.App;
  let baseAMBEthereumSingleNode: BaseAMBEthereumSingleNodeStack;
  let template: Template;
  beforeAll(() => {
    app = new cdk.App();

    // Create the BaseAMBEthereumSingleNodeStack.

    baseAMBEthereumSingleNode = new BaseAMBEthereumSingleNodeStack(app, "base-ethereum-l1-node", {
      stackName: `base-amb-ethereum-single-node-${config.baseNodeConfig.baseNetworkId}`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

      ambEthereumNodeNetworkId: config.baseNodeConfig.ambEntereumNodeNetworkId,
      ambEthereumNodeInstanceType: config.baseNodeConfig.ambEntereumNodeInstanceType,
    });

    template = Template.fromStack(baseAMBEthereumSingleNode);
  });

  test("Check Node URL is correct", () => {
    template.hasOutput("ambethnoderpcurlbillingtoken", {
      Value: {
       "Fn::Join": [
        "",
        [
         "https://",
         {
          "Fn::GetAtt": [
            Match.anyValue(),
           "NodeId"
          ]
         },
         ".t.ethereum.managedblockchain.us-east-1.amazonaws.com?billingtoken=",
         {
          "Fn::GetAtt": [
            Match.anyValue(),
           "BillingToken"
          ]
         }
        ]
       ]
      },
      "Export": {
       "Name": "BaseAmbEthereumNodeRpcUrlWithBillingToken"
      }
     })
  });
});
