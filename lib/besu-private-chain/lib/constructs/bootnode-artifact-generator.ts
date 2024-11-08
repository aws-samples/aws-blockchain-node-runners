import { Construct } from 'constructs';
import path = require('path');
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ChainEventHandlerLambda } from './chain-event-handler-function';
import { ResourceName } from '../constants/resource-names';
import { ValidatorECCKeySet } from './validator-ecc-keyset';
import { PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { getKeySetUniqueString } from '../helper/genesis-helper';
import { ChainArtifactWrapper } from './chain-artifact-wrapper';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export interface BootNodeArtifactGeneratorProps {
  readonly resourcePrefix: string;
  readonly serviceAccount: string;
  readonly region: string;
  readonly shardId: string;
  readonly configBucket: Bucket;
  readonly validatorKeySet: ValidatorECCKeySet;
  readonly version?: number;
}

export class BootNodeArtifactGenerator extends Construct {
  readonly lambda: ChainEventHandlerLambda;

  constructor(scope: Construct, id: string, props: BootNodeArtifactGeneratorProps) {
    super(scope, id);

    const funcName = `${props.resourcePrefix}-${ResourceName.Lambda.BootNodeArtifactGeneratorLambda}-shard-${props.shardId}`;
    const func = new ChainEventHandlerLambda(
      this,
      `${props.resourcePrefix}${ResourceName.Lambda.BootNodeArtifactGeneratorLambda}`,
      {
        functionPath: path.join(__dirname, `../lambda-functions/bootnode-artifact-generator-func.ts`),
        functionName: funcName,
        logicalId: `${props.resourcePrefix}${ResourceName.Lambda.BootNodeArtifactGeneratorLambda}`,
        environment: {
          CONFIG_BUCKET: props.configBucket.bucketName,
          SHARD_ID: props.shardId,
        },
        runtime: Runtime.NODEJS_LATEST,
      },
    );

    props.configBucket.grantReadWrite(func);

    func.node.addDependency(props.validatorKeySet);

    const keySet: Map<string, string> = props.validatorKeySet.getKeyNumToPublicKey();
    const resourceId = PhysicalResourceId.of(`Static-node-${getKeySetUniqueString(Array.from(keySet.keys()))}-v${props.version}`);

    const bootNodeArtifactWrapper = new ChainArtifactWrapper(this, resourceId.toString(), {
      resourceId: resourceId,
      creatorfuncArn: func.functionArn,
      requestPayload: {
        keySet: Object.fromEntries(keySet),
      },
    });

    bootNodeArtifactWrapper.chainArtifact.node.addDependency(func);
  }
}
