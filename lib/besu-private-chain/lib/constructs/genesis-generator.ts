import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ResourceName } from '../constants/resource-names';
import { ValidatorECCKeySet } from './validator-ecc-keyset';
import { PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { getKeySetUniqueString } from '../helper/genesis-helper';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { ChainArtifactWrapper } from './chain-artifact-wrapper';
import { CHAIN_CONFIG } from '../constants/besu';
import { ChainEventHandlerLambda } from './chain-event-handler-function';
import path = require('path');

export interface GenesisGeneratorProps {
  readonly resourcePrefix: string;
  readonly serviceAccount: string;
  readonly region: string;
  readonly shardId: string;
  readonly configBucket: Bucket;
  readonly validatorKeySet: ValidatorECCKeySet;
  readonly version?: number;
}

export class GenesisGenerator extends Construct {
  constructor(scope: Construct, id: string, props: GenesisGeneratorProps) {
    super(scope, id);

    const funcName = `${props.resourcePrefix}-${ResourceName.Lambda.GenesisGeneratorLambda}-shard${props.shardId}`;
    const func = new ChainEventHandlerLambda(
      this,
      `${props.resourcePrefix}GenesisFileGenerator`,
      {
        functionPath: path.join(__dirname, `../lambda-functions/genesis-artifact-generator-func.ts`),
        functionName: funcName,
        logicalId: `${props.resourcePrefix}${ResourceName.Lambda.GenesisGeneratorLambda}`,
        environment: {
          REGION: props.region,
          CONFIG_BUCKET: props.configBucket.bucketName,
          SHARD_ID: props.shardId,
          CHAIN_ID: '' + CHAIN_CONFIG.DEFAULT_CHAIN_ID
        },
        runtime: Runtime.NODEJS_LATEST
      },
    );

    props.configBucket.grantReadWrite(func);
    func.node.addDependency(props.validatorKeySet);

    const keySet: Map<string, string> = props.validatorKeySet.getKeyNumToPublicKey();
    const resourceId = PhysicalResourceId.of(`Genesis-${getKeySetUniqueString(Array.from(keySet.keys()))}-v${props.version}`);

    const genesisArtifactWrapper = new ChainArtifactWrapper(this, resourceId.toString(), {
      resourceId: resourceId,
      creatorfuncArn: func.functionArn,
      requestPayload: Object.fromEntries(keySet),
    });

    genesisArtifactWrapper.chainArtifact.node.addDependency(func);
  }
}
