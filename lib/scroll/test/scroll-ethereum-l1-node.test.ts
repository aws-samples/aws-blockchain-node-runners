import {Match, Template} from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as dotenv from 'dotenv';

dotenv.config({path: './test/.env-test'});
import * as config from "../lib/config/scrollConfig";
import {ScrollAMBEthereumSingleNodeStack} from "../lib/amb-ethereum-single-node-stack";

describe("ScrollAMBEthereumSingleNodeStack", () => {
  let app: cdk.App;
  let scrollAMBEthereumSingleNode: ScrollAMBEthereumSingleNodeStack;
  let template: Template;
  beforeAll(() => {
    app = new cdk.App();

    // Create the ScrollAMBEthereumSingleNodeStack.

    scrollAMBEthereumSingleNode = new ScrollAMBEthereumSingleNodeStack(app, "scroll-ethereum-l1-node", {
      stackName: `scroll-amb-ethereum-single-node-${config.baseNodeConfig.nodeConfiguration}`,
      env: { account: config.baseConfig.accountId, region: config.baseConfig.region },

      ambEthereumNodeNetworkId: config.baseNodeConfig.ambEntereumNodeNetworkId,
      ambEthereumNodeInstanceType: config.baseNodeConfig.ambEntereumNodeInstanceType,
    });

    template = Template.fromStack(scrollAMBEthereumSingleNode);
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
       "Name": "AmbEthereumNodeRpcUrlWithBillingToken"
      }
     })
  });
});
